# Business Planner 500 Error - Fix Documentation

## Problem Description

When accessing `https://millerstorm.tech/sales/plan`, the page was throwing a 500 error:
```
Failed to load resource: the server responded with a status of 500 ()
/api/business-plan?userId=sage@yopmail.com
```

## Root Causes Identified

### 1. **Hardcoded Localhost URL**
The API was using `http://localhost:6789/api/users` which doesn't work in production.

**Location**: `pages/api/business-plan.ts` line 48

**Original Code**:
```typescript
const usersResponse = await fetch(`http://localhost:6789/api/users`);
```

**Fixed Code**:
```typescript
const baseUrl = process.env.NEXT_PUBLIC_API_URL || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
const usersResponse = await fetch(`${baseUrl}/api/users`);
```

### 2. **Email vs User ID Confusion**
The system was passing email addresses as userId instead of the actual user ID (like `user-123456`).

**Issue**: The URL showed `userId=sage@yopmail.com` but the system expects `userId=user-123456`

### 3. **Insufficient Error Handling**
The API didn't have proper error handling or logging to debug issues.

## Changes Made

### File 1: `pages/api/business-plan.ts`

#### Change 1: Fixed URL Construction
```typescript
// Before
const usersResponse = await fetch(`http://localhost:6789/api/users`);

// After
const baseUrl = process.env.NEXT_PUBLIC_API_URL || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
const usersResponse = await fetch(`${baseUrl}/api/users`);

if (!usersResponse.ok) {
  throw new Error(`Failed to fetch users: ${usersResponse.status}`);
}
```

#### Change 2: Added Email Fallback Lookup
```typescript
// Try to find by id first, then by email as fallback
let user = users.find((u: any) => u.id === userId);
if (!user) {
  console.log('⚠️ User not found by ID, trying email lookup...');
  user = users.find((u: any) => u.email === userId);
}

if (!user) {
  console.error('❌ User not found for ID/Email:', userId);
  res.status(404).json({ 
    error: 'User not found', 
    searchedFor: userId, 
    availableIds: users.map((u: any) => u.id),
    availableEmails: users.map((u: any) => u.email)
  });
  return;
}

// Look for plan using the actual user.id (not the search term)
const plan = allBusinessPlans.find((p: any) => p.userId === user.id);
```

#### Change 3: Enhanced Logging
```typescript
console.log('🔍 Looking for user with ID:', userId);
console.log('📋 Available users:', users.map((u: any) => ({ id: u.id, email: u.email, name: u.name })));
console.log('✅ Found user:', { id: user.id, name: user.name, email: user.email });
console.log('📦 Found plan:', plan ? 'Yes' : 'No');
console.log('📤 Sending result:', result);
```

### File 2: `src/portals/sales/BusinessPlanPage.tsx`

#### Added Comprehensive Logging
```typescript
useEffect(() => {
  async function loadBusinessPlan() {
    try {
      console.log('🔍 Loading business plan for user:', props.profile.id);
      console.log('📋 Full profile:', props.profile);
      
      const response = await fetch(`/api/business-plan?userId=${props.profile.id}`);
      console.log('📡 API Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('📦 Received data:', data);
        
        const userPlan = data.find((plan: any) => plan.userId === props.profile.id);
        console.log('🎯 Found plan:', userPlan);
        
        // ... rest of the code
      } else {
        const errorData = await response.json();
        console.error('❌ API Error:', errorData);
      }
    } catch (error) {
      console.error('❌ Failed to load business plan:', error);
    } finally {
      setLoading(false);
    }
  }
  
  loadBusinessPlan();
}, [props.profile.id]);
```

### File 3: `pages/sales/plan.tsx`

#### Added User Profile Loading Logs
```typescript
useEffect(() => {
  async function loadUserProfile() {
    if (!user?.id) {
      console.log('⚠️ No user ID available');
      return;
    }
    
    console.log('🔍 Loading user profile for ID:', user.id);
    
    try {
      const userRes = await fetch(`/api/users/${user.id}`);
      console.log('📡 User API response status:', userRes.status);
      
      if (userRes.ok) {
        const userProfile = await userRes.json();
        console.log('✅ Loaded user profile:', { id: userProfile.id, name: userProfile.name, email: userProfile.email });
        setProfile(userProfile);
      } else {
        const errorData = await userRes.json();
        console.error('❌ Failed to load user profile:', errorData);
      }
    } catch (error) {
      console.error("❌ Failed to load user profile:", error);
    }
  }
  loadUserProfile();
}, [user?.id]);
```

## How the Fix Works

### Flow Diagram:
```
1. User logs in → AuthContext stores user with ID (user-123456)
2. Navigate to /sales/plan
3. plan.tsx loads user profile using user.id
4. BusinessPlanPage receives profile with correct ID
5. Fetches business plan: /api/business-plan?userId=user-123456
6. API constructs proper URL using request headers
7. Fetches users from /api/users
8. Finds user by ID (or email as fallback)
9. Looks up business plan using user.id
10. Returns plan data
```

### Fallback Mechanism:
```typescript
// Primary: Look up by user ID
let user = users.find((u: any) => u.id === userId);

// Fallback: If not found, try email
if (!user) {
  user = users.find((u: any) => u.email === userId);
}

// Always use user.id for plan lookup (not the search term)
const plan = allBusinessPlans.find((p: any) => p.userId === user.id);
```

## Testing Steps

1. **Clear Browser Cache & Cookies**
   ```
   - Open DevTools (F12)
   - Go to Application tab
   - Clear Storage
   - Refresh page
   ```

2. **Login as Sales User**
   ```
   Email: sage@yopmail.com
   Password: [your password]
   ```

3. **Navigate to Business Plan**
   ```
   URL: https://millerstorm.tech/sales/plan
   ```

4. **Check Browser Console**
   ```
   Should see logs like:
   🔍 Loading user profile for ID: user-123456
   📡 User API response status: 200
   ✅ Loaded user profile: {...}
   🔍 Loading business plan for user: user-123456
   📡 API Response status: 200
   📦 Received data: [...]
   ```

5. **Check Server Logs**
   ```
   Should see logs like:
   🔍 Looking for user with ID: user-123456
   📋 Available users: [...]
   ✅ Found user: { id: 'user-123456', name: 'Sage', email: 'sage@yopmail.com' }
   📦 Found plan: Yes/No
   📤 Sending result: [...]
   ```

## Expected Behavior After Fix

### Success Case:
- Page loads without errors
- Business plan form displays with default values
- User can enter Income Goal and Deal Average
- Calculations update in real-time
- Save and Submit buttons work

### No Plan Case:
- Page loads successfully
- Shows default values (Income Goal: $100,000, Deal Ave: $3,800)
- User can create new plan

### Error Case (User Not Found):
- Returns 404 with helpful error message
- Shows available user IDs and emails in response
- Logs detailed information for debugging

## Environment Variables

Add to `.env` file (optional):
```env
NEXT_PUBLIC_API_URL=https://millerstorm.tech
```

If not set, the system will auto-detect from request headers.

## Monitoring & Debugging

### Check Logs:
```bash
# Production server logs
pm2 logs james

# Or check specific log file
tail -f /path/to/logs/next-development.log
```

### Browser Console:
```javascript
// Check current user
console.log(JSON.parse(localStorage.getItem('user')));

// Check API response
fetch('/api/business-plan?userId=user-123456')
  .then(r => r.json())
  .then(console.log);
```

### API Testing:
```bash
# Test users endpoint
curl https://millerstorm.tech/api/users

# Test business plan endpoint
curl "https://millerstorm.tech/api/business-plan?userId=user-123456"
```

## Rollback Plan

If issues persist, revert these files:
1. `pages/api/business-plan.ts`
2. `src/portals/sales/BusinessPlanPage.tsx`
3. `pages/sales/plan.tsx`

```bash
git checkout HEAD~1 pages/api/business-plan.ts
git checkout HEAD~1 src/portals/sales/BusinessPlanPage.tsx
git checkout HEAD~1 pages/sales/plan.tsx
```

## Future Improvements

1. **Standardize User ID Usage**
   - Ensure all APIs use consistent user ID format
   - Add validation middleware

2. **Better Error Messages**
   - User-friendly error messages
   - Detailed admin logs

3. **API Response Caching**
   - Cache user data to reduce API calls
   - Implement SWR or React Query

4. **Type Safety**
   - Add TypeScript interfaces for all API responses
   - Validate data at runtime

5. **Unit Tests**
   - Add tests for user lookup logic
   - Test email fallback mechanism

## Related Files

- `pages/api/business-plan.ts` - Main API endpoint
- `pages/api/business-plans.ts` - List all plans
- `src/portals/sales/BusinessPlanPage.tsx` - Sales UI
- `src/portals/manager/TeamBusinessPlans.tsx` - Manager UI
- `pages/sales/plan.tsx` - Sales page wrapper
- `pages/manager/plans.tsx` - Manager page wrapper
- `src/lib/models/BusinessPlan.ts` - Database model
- `src/contexts/AuthContext.tsx` - Authentication

## Support

If issues persist:
1. Check server logs for detailed error messages
2. Verify MongoDB connection
3. Ensure user exists in database
4. Check network tab in browser DevTools
5. Contact development team with console logs

---

**Last Updated**: January 2024
**Fixed By**: Development Team
**Status**: ✅ Resolved
