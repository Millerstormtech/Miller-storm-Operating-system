import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { BusinessPlanModel, BusinessPlansModel, SalesBusinessPlanModel } from "../../src/lib/models/BusinessPlan";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await connectMongo();

  if (req.method === "GET") {
    try {
      // Try different collection names
      let businessPlans = await BusinessPlanModel.find().lean();
      console.log('BusinessPlan collection results:', businessPlans.length);
      
      if (businessPlans.length === 0) {
        businessPlans = await BusinessPlansModel.find().lean();
        console.log('BusinessPlans collection results:', businessPlans.length);
      }
      
      if (businessPlans.length === 0) {
        businessPlans = await SalesBusinessPlanModel.find().lean();
        console.log('SalesBusinessPlan collection results:', businessPlans.length);
      }
      
      // If still empty, check if data is in user collection
      if (businessPlans.length === 0) {
        const { UserModel } = await import("../../src/lib/models/User");
        const usersWithPlans = await UserModel.find({ businessPlan: { $exists: true, $ne: null } }).lean();
        console.log('Users with business plans:', usersWithPlans.length);
        businessPlans = usersWithPlans.map(user => ({ ...user.businessPlan, userId: user.id }));
      }
      
      console.log('Final business plans to return:', businessPlans.length);
      res.status(200).json(businessPlans);
      return;
    } catch (error) {
      console.error('Business plans API error:', error);
      res.status(500).json({ error: 'Failed to fetch business plans' });
      return;
    }
  }

  res.setHeader("Allow", "GET");
  res.status(405).end();
}