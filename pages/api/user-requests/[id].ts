import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserRequestModel } from "../../../src/lib/models/UserRequest";
import { UserModel } from "../../../src/lib/models/User";
import { sendAccountApprovedEmail, sendAccountRejectedEmail, sendQuickStartUserEmail, sendQuickStartManagerEmail } from "../../../src/lib/email";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await connectMongo();

  const { id } = req.query;

  if (req.method === "PUT") {
    try {
      const { action, rejectionReason, reviewedBy } = req.body;

      if (!["approve", "reject"].includes(action)) {
        res.status(400).json({ error: "Invalid action" });
        return;
      }

      const userRequest = await UserRequestModel.findOne({ id });

      if (!userRequest) {
        res.status(404).json({ error: "Request not found" });
        return;
      }

      if (userRequest.status !== "pending") {
        res.status(400).json({ error: "Request already processed" });
        return;
      }

      if (action === "approve") {
        // Check if user already exists
        const existingUser = await UserModel.findOne({ email: userRequest.email });
        if (existingUser) {
          res.status(400).json({ error: "User with this email already exists" });
          return;
        }

        const moduleKeys = [
          "dashboard",
          "userManagement",
          "roleHierarchy",
          "businessUnits",
          "salesOverview",
          "marketingOverview",
          "courseManagement",
          "materialsLibrary",
          "approvalWorkflows",
          "aiBots",
          "webTemplates",
          "featureToggles",
          "systemSettings",
          "teamBusinessPlans",
          "teamFunnelMetrics",
          "teamTraining",
          "aiAssistant",
          "businessPlan",
          "trainingCenter",
          "marketingMaterials",
          "aiChat",
          "repWebPage",
          "businessCards",
          "assetLibrary",
          "contentApprovals",
          "socialMetrics"
        ];
        const defaultToggles = moduleKeys.reduce<Record<string, boolean>>(
          (acc, key) => {
            acc[key] = true;
            return acc;
          },
          {}
        );

        // Create user account with the hashed password from registration
        const newUser = await UserModel.create({
          id: `user-${Date.now()}`,
          name: userRequest.name,
          email: userRequest.email,
          role: userRequest.role || "sales",
          roles: [userRequest.role || "sales"],
          passwordHash: userRequest.passwordHash,
          strengths: "",
          weaknesses: "",
          publicProfile: {
            showHeadshot: false,
            showEmail: false,
            showPhone: false,
            showStrengths: false,
            showWeaknesses: false,
            showTerritory: false
          },
          featureToggles: defaultToggles
        });

        // Update request status
        userRequest.status = "approved";
        userRequest.reviewedAt = new Date();
        userRequest.reviewedBy = reviewedBy;
        await userRequest.save();

        // Send approval email
        try {
          const loginUrl = `http://${process.env.PRIMARY_DOMAIN || 'localhost:6789'}/login`;
          await sendAccountApprovedEmail(userRequest.name, userRequest.email, userRequest.role, loginUrl);
          console.log("Approval email sent to:", userRequest.email);
        } catch (emailError: any) {
          console.error("Failed to send approval email:", emailError.message || emailError);
        }

        // Send 48-hour Quick Start onboarding email for sales users
        if (userRequest.role === "sales") {
          try {
            await sendQuickStartUserEmail(userRequest.name, userRequest.email);

            if (newUser.managerId) {
              const manager = await UserModel.findOne({ id: newUser.managerId }).lean();
              if (manager?.email) {
                await sendQuickStartManagerEmail(userRequest.name, manager.name || manager.email, manager.email);
              }
            }

            console.log("Quick Start onboarding email sent to:", userRequest.email);
          } catch (emailError: any) {
            console.error("Failed to send Quick Start email:", emailError.message || emailError);
          }
        }

        res.status(200).json({ 
          message: "User approved and created successfully",
          userId: newUser.id,
          userEmail: newUser.email,
          userRole: newUser.role
        });
      } else if (action === "reject") {
        userRequest.status = "rejected";
        userRequest.rejectionReason = rejectionReason || "No reason provided";
        userRequest.reviewedAt = new Date();
        userRequest.reviewedBy = reviewedBy;
        await userRequest.save();

        // Send rejection email
        try {
          await sendAccountRejectedEmail(userRequest.name, userRequest.email, userRequest.rejectionReason);
          console.log("Rejection email sent to:", userRequest.email);
        } catch (emailError: any) {
          console.error("Failed to send rejection email:", emailError.message || emailError);
        }

        res.status(200).json({ message: "User request rejected" });
      }
    } catch (error) {
      console.error("Failed to process user request:", error);
      res.status(500).json({ error: "Failed to process request" });
    }
  } else {
    res.setHeader("Allow", ["PUT"]);
    res.status(405).end();
  }
}
