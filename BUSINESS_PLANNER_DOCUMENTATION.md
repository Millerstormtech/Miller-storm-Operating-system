# Business Planner - Complete Documentation

## Overview
The Business Planner is a comprehensive sales planning and tracking system that allows sales representatives to set income goals, calculate required activities, and track progress. Managers can view and edit their team's plans, while the system automatically calculates metrics based on industry ratios.

---

## 🎯 Key Features

### For Sales Representatives:
1. **Income Goal Setting** - Set annual revenue targets
2. **Deal Average Configuration** - Define average deal size
3. **Automatic Calculations** - System calculates required activities
4. **Draft & Submit** - Save drafts or commit plans
5. **Notifications** - Manager and admins notified on submission

### For Managers:
1. **Team Overview** - View all team members' plans
2. **Edit Capabilities** - Modify team member plans
3. **Aggregated Metrics** - See team totals and targets
4. **Status Tracking** - Monitor committed vs draft plans

---

## 📊 Business Logic & Calculations

### Core Formula:
```
Deals Per Year = Income Goal ÷ Deal Average
Deals Per Month = Deals Per Year ÷ 12

Claims Per Year = Deals Per Year × 3
Claims Per Month = Claims Per Year ÷ 12

Inspections Per Year = Claims Per Year × 3
Inspections Per Month = Inspections Per Year ÷ 12
```

### Hardcoded Ratios:
- **Claims Ratio**: 25% (3:1 ratio - 3 claims needed per deal)
- **Inspection Ratio**: 30% (3:1 ratio - 3 inspections needed per claim)

### Example Calculation:
```
Income Goal: $100,000
Deal Average: $3,800

Deals Per Year: 100,000 ÷ 3,800 = 26 deals
Deals Per Month: 26 ÷ 12 = 2.17 deals

Claims Per Year: 26 × 3 = 78 claims
Claims Per Month: 78 ÷ 12 = 6.5 claims

Inspections Per Year: 78 × 3 = 234 inspections
Inspections Per Month: 234 ÷ 12 = 19.5 inspections
```

---

## 🏗️ System Architecture

### Frontend Components:

#### 1. **Sales Portal** (`src/portals/sales/BusinessPlanPage.tsx`)
- User input form for Income Goal and Deal Average
- Real-time calculation display
- Draft and Submit buttons
- Status indicators (Draft/Committed)

#### 2. **Manager Portal** (`src/portals/manager/TeamBusinessPlans.tsx`)
- Team totals dashboard
- Individual team member plans table
- Edit modal for modifying plans
- Aggregated yearly and monthly targets

#### 3. **Mobile App** (`Jamesapk/lib/screens/planner_screen.dart`)
- Currently shows "Coming Soon" placeholder
- Designed UI ready for implementation
- Bottom navigation integration

### Backend API:

#### 1. **Business Plan API** (`pages/api/business-plan.ts`)
**POST** - Save/Update Business Plan
```typescript
Request Body:
{
  userId: string,
  businessPlan: {
    revenueGoal: number,
    averageDealSize: number,
    daysPerWeek: number,
    territories: string[],
    dealsPerYear: number,
    dealsPerMonth: number,
    inspectionsNeeded: number,
    committed: boolean
  }
}
```

**GET** - Fetch Business Plans
```typescript
Query Parameters:
- userId: string (optional) - Get specific user's plan
- managerId: string (optional) - Get all plans for manager's team

Response:
[{
  userId: string,
  userName: string,
  userRole: string,
  managerId: string,
  businessPlan: {...},
  actuals: {...},
  updatedAt: Date
}]
```

#### 2. **Database Model** (`src/lib/models/BusinessPlan.ts`)
```typescript
{
  userId: String (required),
  revenueGoal: Number,
  daysPerWeek: Number,
  territories: [String],
  selectedPresetId: String,
  averageDealSize: Number,
  dealsPerYear: Number,
  dealsPerMonth: Number,
  inspectionsNeeded: Number,
  doorsPerYear: Number,
  doorsPerDay: Number,
  committed: Boolean,
  timestamps: true
}
```

---

## 🔄 User Workflows

### Sales Rep Workflow:

1. **Access Business Planner**
   - Navigate to Sales Portal → Plan section
   - URL: `/sales/plan`

2. **Set Goals**
   - Enter Income Goal (e.g., $100,000)
   - Enter Deal Average (e.g., $3,800)
   - System auto-calculates all metrics

3. **Review Calculations**
   - View Yearly Goals table (Deals, Claims, Inspections)
   - View Monthly Goals table (Deals, Claims, Inspections)

4. **Save Options**
   - **Save as Draft**: Saves without notifying anyone
   - **Submit**: Commits plan and notifies manager + admins

5. **Notifications Sent**
   - Manager receives notification
   - All admins receive notification
   - Notification includes change details

### Manager Workflow:

1. **Access Team Plans**
   - Navigate to Manager Portal → Plans
   - URL: `/manager/plans`

2. **View Team Totals**
   - See aggregated Income Goal
   - View total Deals/Claims/Inspections (Yearly & Monthly)
   - Only committed plans are included in totals

3. **Review Individual Plans**
   - Table shows all team members
   - Columns: Name, Income Goal, Deal Ave, Deals, Claims, Inspections
   - Status indicator: Committed or Draft

4. **Edit Team Member Plan**
   - Click "Edit" button on any team member
   - Modal opens with editable fields
   - Modify Income Goal, Deal Ave, Working Days
   - Click "Save" to update

5. **Notification Sent**
   - Sales rep receives notification
   - Notification indicates manager made changes

---

## 📱 Platform Availability

### ✅ Web Application (Fully Functional)
- **Sales Portal**: `/sales/plan`
- **Manager Portal**: `/manager/plans`
- Full CRUD operations
- Real-time calculations
- Notification system

### ⏳ Mobile App (Coming Soon)
- **Flutter App**: `planner_screen.dart`
- UI designed but not implemented
- Shows "Coming Soon" message
- Navigation structure ready

---

## 🔔 Notification System

### When Sales Rep Submits Plan:
```typescript
Notification to Manager:
{
  userId: managerId,
  type: 'plan_updated',
  title: 'Sales Rep Updated Plan',
  message: '{RepName} updated their business plan. {Changes}',
  metadata: { updatedBy: 'sales', targetUser: repId }
}

Notification to Admins:
{
  userId: adminId,
  type: 'plan_updated',
  title: 'Sales Rep Updated Plan',
  message: '{RepName} updated their business plan. {Changes}',
  metadata: { updatedBy: 'sales', targetUser: repId }
}
```

### When Manager Edits Plan:
```typescript
Notification to Sales Rep:
{
  userId: repId,
  type: 'plan_updated',
  title: 'Business Plan Updated',
  message: 'Your manager updated your business plan.',
  metadata: { updatedBy: 'manager', businessPlan: {...} }
}
```

---

## 🗄️ Database Structure

### Collection: `businessPlans`
```json
{
  "_id": "ObjectId",
  "userId": "user123",
  "businessPlan": {
    "revenueGoal": 100000,
    "daysPerWeek": 5,
    "territories": ["Territory A"],
    "averageDealSize": 3800,
    "dealsPerYear": 26,
    "dealsPerMonth": 2,
    "inspectionsNeeded": 20,
    "doorsPerYear": 0,
    "doorsPerDay": 0,
    "committed": true
  },
  "actuals": {
    // Future feature for tracking actual performance
  },
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-15T00:00:00.000Z"
}
```

---

## 🎨 UI Components

### Sales Portal UI:

#### Input Section:
```
┌─────────────────────────────────────────┐
│ My Inputs:                              │
├─────────────────┬───────────────────────┤
│ Income Goal     │ Deal Average          │
│ $ [100,000]     │ $ [3,800]            │
└─────────────────┴───────────────────────┘
```

#### Yearly Goals Table:
```
┌─────────┬─────────┬──────────────┐
│ Deals   │ Claims  │ Inspections  │
├─────────┼─────────┼──────────────┤
│   26    │   78    │     234      │
└─────────┴─────────┴──────────────┘
```

#### Monthly Goals Table:
```
┌─────────┬─────────┬──────────────┐
│ Deals   │ Claims  │ Inspections  │
├─────────┼─────────┼──────────────┤
│   3     │   7     │      20      │
└─────────┴─────────┴──────────────┘
```

#### Action Buttons:
```
[Save as Draft]  [Submit]
```

### Manager Portal UI:

#### Team Totals Dashboard:
```
┌──────────────────┬──────────────┬─────────────────┐
│ Total Income Goal│ Claims Ratio │ Inspection Ratio│
│   $500,000       │     25%      │      30%        │
└──────────────────┴──────────────┴─────────────────┘
```

#### Team Plans Table:
```
┌──────────┬────────┬─────────┬───────┬────────┬────────┬──────────┬──────────┐
│ Rep Name │ Income │ Deal Ave│ Deals │ Claims │ Insp.  │ Status   │ Actions  │
├──────────┼────────┼─────────┼───────┼────────┼────────┼──────────┼──────────┤
│ John Doe │$100,000│ $3,800  │  26   │   78   │  234   │Committed │  [Edit]  │
│ Jane S.  │$120,000│ $4,000  │  30   │   90   │  270   │  Draft   │  [Edit]  │
└──────────┴────────┴─────────┴───────┴────────┴────────┴──────────┴──────────┘
```

---

## 🔐 Access Control

### Role-Based Permissions:

| Feature | Sales Rep | Manager | Admin |
|---------|-----------|---------|-------|
| View Own Plan | ✅ | ✅ | ✅ |
| Edit Own Plan | ✅ | ✅ | ✅ |
| View Team Plans | ❌ | ✅ | ✅ |
| Edit Team Plans | ❌ | ✅ | ✅ |
| View All Plans | ❌ | ❌ | ✅ |
| Receive Notifications | ✅ | ✅ | ✅ |

---

## 🚀 API Endpoints Summary

### 1. Save/Update Business Plan
```
POST /api/business-plan
Body: { userId, businessPlan, actuals }
Response: { success: true }
```

### 2. Get User's Business Plan
```
GET /api/business-plan?userId={userId}
Response: [{ userId, userName, businessPlan, actuals }]
```

### 3. Get Manager's Team Plans
```
GET /api/business-plan?managerId={managerId}
Response: [{ userId, userName, businessPlan, actuals }]
```

### 4. Get All Business Plans
```
GET /api/business-plans
Response: [{ userId, revenueGoal, dealsPerYear, ... }]
```

### 5. Create Notification
```
POST /api/notifications
Body: { userId, type, title, message, metadata }
Response: { success: true }
```

---

## 📈 Future Enhancements

### Planned Features:
1. **Actuals Tracking** - Track actual performance vs plan
2. **Mobile App Implementation** - Full Flutter app functionality
3. **Progress Visualization** - Charts and graphs
4. **Historical Data** - View past plans and performance
5. **Custom Ratios** - Allow customization of claims/inspection ratios
6. **Territory Management** - Better territory assignment
7. **Preset Templates** - Pre-configured plan templates
8. **Export Functionality** - Export plans to PDF/Excel

---

## 🐛 Known Issues & Limitations

1. **Mobile App**: Not yet implemented (shows "Coming Soon")
2. **Actuals Tracking**: Database field exists but not used
3. **Working Days**: Field exists but not used in calculations
4. **Territories**: Array field but only uses first element
5. **Doors Metrics**: Fields exist but always set to 0

---

## 🔧 Technical Stack

### Frontend:
- **Web**: React + TypeScript + Next.js
- **Mobile**: Flutter + Dart
- **Styling**: Inline styles + CSS modules

### Backend:
- **API**: Next.js API Routes
- **Database**: MongoDB with Mongoose
- **Authentication**: Custom auth context

### Key Libraries:
- `mongoose` - MongoDB ODM
- `react` - UI framework
- `next` - Full-stack framework
- `flutter` - Mobile framework

---

## 📝 Code Examples

### Calculate Metrics Function:
```typescript
const calculateMetrics = (incomeGoal: number, dealAve: number) => {
  const dealsPerYear = dealAve > 0 ? Math.round(incomeGoal / dealAve) : 0;
  const dealsPerMonth = dealsPerYear / 12;
  const claimsPerYear = Math.round(dealsPerYear * 3);
  const claimsPerMonth = claimsPerYear / 12;
  const inspectionsPerYear = Math.round(claimsPerYear * 3);
  const inspectionsPerMonth = inspectionsPerYear / 12;

  return {
    dealsPerYear,
    dealsPerMonth,
    claimsPerYear,
    claimsPerMonth,
    inspectionsPerYear,
    inspectionsPerMonth
  };
};
```

### Save Business Plan:
```typescript
async function handleSavePlan() {
  const plan: BusinessPlan = {
    revenueGoal: incomeGoal,
    daysPerWeek: workingDaysPerWeek,
    territories: [profile.territory || ""],
    averageDealSize: dealAve,
    dealsPerYear: metrics.dealsPerYear,
    dealsPerMonth: Math.round(metrics.dealsPerMonth),
    inspectionsNeeded: Math.round(metrics.inspectionsPerMonth),
    doorsPerYear: 0,
    doorsPerDay: 0,
    committed: false
  };

  await fetch('/api/business-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: profile.id,
      businessPlan: plan
    })
  });
}
```

---

## 🎓 Training Guide

### For Sales Reps:
1. Log in to Sales Portal
2. Click "Plan" in navigation
3. Enter your annual income goal
4. Enter your average deal size
5. Review calculated metrics
6. Click "Save as Draft" to save without committing
7. Click "Submit" when ready to commit
8. Your manager will be notified

### For Managers:
1. Log in to Manager Portal
2. Click "Plans" in navigation
3. Review team totals at the top
4. Scroll down to see individual plans
5. Click "Edit" to modify a team member's plan
6. Make changes and click "Save"
7. Team member will be notified

---

## 📞 Support & Troubleshooting

### Common Issues:

**Issue**: Plan not saving
- **Solution**: Check network connection, verify user is logged in

**Issue**: Calculations seem wrong
- **Solution**: Verify Income Goal and Deal Average are correct

**Issue**: Manager can't see team plans
- **Solution**: Verify team members have correct managerId assigned

**Issue**: Notifications not received
- **Solution**: Check notification API endpoint is working

---

## 📊 Success Metrics

### Key Performance Indicators:
- Number of committed plans
- Average income goal per rep
- Team total revenue goals
- Plan completion rate
- Time to commit plan

---

## 🔄 Version History

### Current Version: 1.0
- ✅ Sales rep can create/edit plans
- ✅ Manager can view/edit team plans
- ✅ Automatic calculations
- ✅ Notification system
- ✅ Draft and commit functionality
- ⏳ Mobile app (pending)
- ⏳ Actuals tracking (pending)

---

## 📚 Related Documentation

- User Management System
- Notification System
- Sales Portal Overview
- Manager Portal Overview
- API Documentation
- Database Schema

---

**Last Updated**: January 2024
**Maintained By**: Development Team
**Contact**: support@millerstorm.tech
