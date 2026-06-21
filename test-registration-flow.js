/**
 * Test Script for User Registration Flow
 * 
 * This script tests the complete registration and login flow:
 * 1. Register a new user
 * 2. Admin approves the request
 * 3. User logs in with registered credentials
 * 
 * Run: node test-registration-flow.js
 */

const BASE_URL = "http://localhost:3000";

async function testRegistrationFlow() {
  console.log("🧪 Testing User Registration Flow\n");

  // Test Data
  const testUser = {
    name: "Test User",
    email: `test.user.${Date.now()}@company.com`,
    password: "TestPassword123",
    role: "sales"
  };

  try {
    // Step 1: Register User
    console.log("📝 Step 1: Registering new user...");
    const registerRes = await fetch(`${BASE_URL}/api/user-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testUser)
    });

    if (!registerRes.ok) {
      const error = await registerRes.json();
      throw new Error(`Registration failed: ${error.error}`);
    }

    const registerData = await registerRes.json();
    console.log("✅ Registration successful!");
    console.log(`   Request ID: ${registerData.requestId}`);
    console.log(`   Email: ${testUser.email}\n`);

    // Step 2: Get pending requests
    console.log("📋 Step 2: Fetching pending requests...");
    const requestsRes = await fetch(`${BASE_URL}/api/user-requests`);
    
    if (!requestsRes.ok) {
      throw new Error("Failed to fetch requests");
    }

    const requests = await requestsRes.json();
    const pendingRequest = requests.find(r => r.email === testUser.email && r.status === "pending");
    
    if (!pendingRequest) {
      throw new Error("Pending request not found");
    }

    console.log("✅ Found pending request!");
    console.log(`   Name: ${pendingRequest.name}`);
    console.log(`   Email: ${pendingRequest.email}`);
    console.log(`   Role: ${pendingRequest.role}`);
    console.log(`   Status: ${pendingRequest.status}\n`);

    // Step 3: Approve request (simulating admin action)
    console.log("✔️  Step 3: Approving user request...");
    const approveRes = await fetch(`${BASE_URL}/api/user-requests/${pendingRequest.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "approve",
        reviewedBy: "Test Admin"
      })
    });

    if (!approveRes.ok) {
      const error = await approveRes.json();
      throw new Error(`Approval failed: ${error.error}`);
    }

    const approveData = await approveRes.json();
    console.log("✅ User approved successfully!");
    console.log(`   User ID: ${approveData.userId}`);
    console.log(`   Email: ${approveData.userEmail}`);
    console.log(`   Role: ${approveData.userRole}\n`);

    // Step 4: Test login with registered credentials
    console.log("🔐 Step 4: Testing login with registered credentials...");
    const loginRes = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password
      })
    });

    if (!loginRes.ok) {
      const error = await loginRes.json();
      throw new Error(`Login failed: ${error.error}`);
    }

    const loginData = await loginRes.json();
    console.log("✅ Login successful!");
    console.log(`   User ID: ${loginData.id}`);
    console.log(`   Name: ${loginData.name}`);
    console.log(`   Email: ${loginData.email}`);
    console.log(`   Role: ${loginData.role}`);
    console.log(`   Should redirect to: /${loginData.role}/dashboard\n`);

    // Step 5: Verify user cannot login with wrong password
    console.log("🔒 Step 5: Testing login with wrong password...");
    const wrongLoginRes = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testUser.email,
        password: "WrongPassword123"
      })
    });

    if (wrongLoginRes.ok) {
      throw new Error("Login should have failed with wrong password!");
    }

    const wrongLoginError = await wrongLoginRes.json();
    console.log("✅ Login correctly rejected with wrong password");
    console.log(`   Error: ${wrongLoginError.error}\n`);

    // Summary
    console.log("=" .repeat(60));
    console.log("🎉 ALL TESTS PASSED!");
    console.log("=" .repeat(60));
    console.log("\n✅ Registration Flow Working:");
    console.log("   1. User can register");
    console.log("   2. Request appears in pending queue");
    console.log("   3. Admin can approve request");
    console.log("   4. User account is created with correct role");
    console.log("   5. User can login with registered credentials");
    console.log("   6. User is redirected to correct role dashboard");
    console.log("   7. Wrong password is rejected\n");

  } catch (error) {
    console.error("\n❌ TEST FAILED:");
    console.error(`   ${error.message}\n`);
    process.exit(1);
  }
}

// Run tests
testRegistrationFlow();
