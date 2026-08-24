flowchart TB
    %% ==========================================
    %% 1. DEMAND INGESTION & DRAFT
    %% ==========================================
    SO([Sales Order]) --> Draft["Draft Job Sheet Creation"]
    FC([Forecast]) --> Draft
    
    %% ==========================================
    %% 2. DRAFT BRANCHING: MANUAL VS AI
    %% ==========================================
    Draft -->|Manual Path| AddWO["Manual: Add Work Order"]
    Draft -->|AI Automation|AISplit["AI Split Work order"]
    AISplit-->AI_BOM["AI Auto Assign BOM"]
    
    %% ==========================================
    %% 3. MANUAL 'ADD WORK ORDER' PATH
    %% ==========================================
    AddWO --> DispGoal["Display Remaining Goal Quantities"]
    DispGoal --> SelGoal["User Selects Target Goal from Job Sheet"]
    SelGoal --> ManBOM["Select BOM <br>or Create, Update, Delete"]
    ManBOM --> ManRoute["Select Route or Create, Update, Delete)"]
    ManRoute --> ManFeas{"Feasibility Validation: Stock"}
    
    ManFeas -->|No -Edit| ManEdit["CRUD Operation: Modify BOM or Route"]
    ManEdit --> ManFeas
    ManFeas -->|No - Lack Material| ManPO["System Generate PR"]
    ManPO -->poManager["Alert Project Manager"]
    poManager-->ManFeas
    ManFeas -->|Yes| Summary["Production Summary Engine <br>(Calculates Expected Output, Material, Cost, & Time)"]
    
    %% ==========================================
    %% 4. AI AUTO-ASSIGNMENT PATH
    %% ==========================================
    
    AI_BOM --> AI_Route["AI Auto Assign Route"]
    AI_Route --> AI_CheckEmpty{"Database Audit: <br>Got existing BOM and Route?"}
    
    AI_CheckEmpty -->|No - Empty / Not Found| ManBOM
    AI_CheckEmpty -->|Yes| ManFeas
    Summary
    
    %% ==========================================
    %% 5. SUMMARY, CONFIRMATION & RESTRICTED CRUD
    %% ==========================================
    Summary -->scheduleMa["AI auto schedule machine slot"]
     scheduleMa--> ConfirmWO{"Confirm Work Order or Edit (CRUD)"}
    
    ConfirmWO -->|Execute CRUD| EditActions["Modify BOM, Route, or Machine Slot"]
    EditActions --> ReFeas{"Re-check Modification Feasibility"}
    ReFeas -->|No| EditActions
    ReFeas-->|NO Insufficient Stock|ManPO1["System Generate PR"]
    ManPO1 -->poManager1["Alert Project Manager"]
    poManager1-->ReFeas
    ReFeas -->|Yes| ConfirmWO
    
    ConfirmWO -->|Confirm|PendingJS["Finalize Pending Job Sheet Payload"]
    
    %% ==========================================
    %% 6. APPROVAL & MATERIAL ISSUE LOGISTICS
    %% ==========================================
    PendingJS --> approvalJobsheet{"Production Manager Approve JobSheet?"}
    approvalJobsheet -->|YES| SoftRes["Soft Reservation Engine: <br>(System Locks Available Stock in Database)"]
    approvalJobsheet -->|NO| Draft
    
    SoftRes --> PickList["Warehouse Module: Storekeeper Generates Pick List"]
    PickList --> MatDispatch["Inventory Transaction: Material Dispatch <br>(Physical Stock Drop)"]

    
    %% ==========================================
    %% 7. ACTIVE SHOP FLOOR & EXCEPTIONS
    %% ==========================================
     MatDispatch --> WIPStart["Work in Progress (WIP) Module: <br>Record Start & End Timestamp"]
    WIPStart --> Running["Job Status Flag > RUNNING <br>(Initialize Passive Production Timer)"]
    
    Running --> VerifyID["Operator Authentication: Verify Identity"]
    VerifyID --> StartJob["Shop Floor Terminal: Operator Taps START"]
    StartJob --> Exception{"Real-time Monitoring: <br>Issue Occurs?"}
    
    Exception -->|Yes - Interruption| Down["Operator Terminal: Tap FINISH"]
    Down --> Reason["Exception Logging: Input Downtime Reason"]
    Reason --> InpQty["Exception Logging: Input Yield, Scrap & Waste Qty"]
    InpQty --> Emergency{"Escalation Protocol: <br>Call Supervisor?"}
    
    Emergency -->|NO| VerifyID
    Emergency -->|Yes| Stopped["Job Status Flag > STOPPED <br>(Lock Operation)"]
    Stopped --> SupReview{"Supervisor Review Console"}
    SupReview -->|Not Approval| Running
    
    Exception -->|No - Normal Completion| OpFinish["Operator Terminal: Tap FINISH"]
    OpFinish --> InputQty["Production Output: Input Final Yield, Scrap & Waste Qty"]
    InputQty --> Stopped
    
    %% ==========================================
    %% 8. QUALITY CONTROL, COSTING & REPORTS
    %% ==========================================
    SupReview --Approval--> Quality{"Quality Result Audit"}
    
    Quality -->|BAD - Defective| CheckLife{"Component Lifecycle: <br>Max Reuses Reached?"}
    
    CheckLife -->|NO - Eligible for Rework| ReuseAction["Tag as Reused Material"]
    ReuseAction --> ReworkWO["System Action: Auto-Generate New Rework Work Order / Draft"]
    ReworkWO --> Draft
    
    CheckLife -->|YES - Terminal| Waste["Log Terminal Scrap: True Waste / Scrap"]
    Waste --> CostingWaste["Financial Ledger: Log Scrap Cost"]
    CostingWaste --> ActCost
    
    Quality -->|GOOD - Accepted| CheckYield{"Yield Validation: <br>Total Good Qty Enough?"}
    
    CheckYield -->|NO - Deficit| Sum["Deficit Calculator: Calculate Missing Quantity"]
    Sum --> ReworkWO

    
    CheckYield -->|YES - Fulfilled| ActCost["Actual Cost Calculation"]
    ActCost --> FGTN(["FGTN & AI Generate Report"])