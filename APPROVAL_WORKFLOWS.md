# Approval Workflows

---

## Users & Roles

| Name | Email | Role | Reports To |
|---|---|---|---|
| Ahmed Al-Rashidi | ahmed@company.com | **admin (CEO)** | — (self) |
| Khalid Al-Mansouri | khalid@company.com | **manager** | Ahmed |
| Sara Hassan | sara@company.com | **employee** | Khalid |

**Approval chain:**
- Employee (Sara) submits → assigned to **Manager (Khalid)**
- Manager (Khalid) submits → assigned to **CEO (Ahmed)**
- CEO (Ahmed) submits → assigned to **CEO (Ahmed)** (self-approval)

**Visibility:**
- `employee` — sees only their own records
- `manager`, `admin` — see all records; either can approve any request

---

## 1. Leave Request

**Route:** `POST /api/leaves` → `PUT /api/leaves/:id`

### Flow

```
User submits leave
       ↓
Record created  (status: pending)
Task created    (assigned to submitter's managerId)
       ↓
Approver approves or rejects
       ↓
Leave status → approved / rejected
Task status  → approved / rejected
```

| Submitter | Task Assigned To |
|---|---|
| Sara | Khalid |
| Khalid | Ahmed |
| Ahmed | Ahmed (self) |

---

## 2. Work From Home (WFH)

**Route:** `POST /api/wfh` → `PUT /api/wfh/:id`

### Flow

```
User submits WFH request
       ↓
Record created  (status: pending)
Task created    (assigned to submitter's managerId)
       ↓
Approver approves or rejects
       ↓
WFH status  → approved / rejected
Task status → approved / rejected
```

| Submitter | Task Assigned To |
|---|---|
| Sara | Khalid |
| Khalid | Ahmed |
| Ahmed | Ahmed (self) |

---

## 3. Business Trip (Travel)

**Route:** `POST /api/travel` → `PUT /api/travel/:id`

### Flow

```
User searches flights + hotel, then submits trip
       ↓
Record created  (status: pending)
Task created    (assigned to submitter's managerId)
Task priority → "high" if total cost > SAR 10,000, otherwise "medium"
       ↓
Approver approves or rejects
       ↓
Travel status → approved / rejected
Task status   → approved / rejected
```

| Submitter | Task Assigned To |
|---|---|
| Sara | Khalid |
| Khalid | Ahmed |
| Ahmed | Ahmed (self) |

---

## 4. Purchase Order (PO)

**Route:** `POST /api/purchase-orders` → `PUT /api/purchase-orders/:id/approve` or `/reject`

### Flow

```
User submits purchase order
       ↓
PO record created  (status: pending, poNumber: PO-YYYY-NNNN)
Task created       (assigned to submitter's managerId)
       ↓
Approver approves or rejects
       ↓
PO status   → approved / rejected
Task status → approved / rejected
```

| Submitter | Task Assigned To |
|---|---|
| Sara | Khalid |
| Khalid | Ahmed |
| Ahmed | Ahmed (self) |

---

## 5. Material Requisition (Warehouse)

**Route:** `POST /api/material-requisitions` → `PUT /api/material-requisitions/:id/approve` or `/reject`

### Flow

```
User submits material requisition
       ↓
MRQ record created  (status: pending, mrqNumber: MR-YYYY-NNNN)
Task created        (assigned to submitter's managerId)
Task priority → "high" if priority = "urgent", otherwise "medium"
       ↓
Approver approves or rejects
       ↓
MRQ status  → approved / rejected
Task status → approved / rejected
```

| Submitter | Task Assigned To |
|---|---|
| Sara | Khalid |
| Khalid | Ahmed |
| Ahmed | Ahmed (self) |

---

## 6. EMS — New Document Version

**Route:** `POST /api/ems/documents/:id/versions` → `POST /api/ems/documents/:id/versions/:version/approve` or `/reject`

### Flow

```
User uploads a new version of an existing document
       ↓
Version added with status: "pending"
currentVersion stays unchanged until approved
Task created  (assigned to submitter's managerId)
Document locked — no further uploads until resolved
       ↓
Approver approves or rejects
       ↓
Approve: version status → "approved", currentVersion bumped, task → approved
Reject:  version entry removed, physical file deleted, task → rejected
```

| Submitter | Task Assigned To |
|---|---|
| Sara | Khalid |
| Khalid | Ahmed |
| Ahmed | Ahmed (self) |

> **Note:** On rejection the uploaded file is permanently deleted from disk and the version entry is removed from the document. The "View Document" button is hidden for rejected EMS tasks.

---

## Task Status Reference

| Decision | Task Status | Record Status |
|---|---|---|
| Approved | `approved` | `approved` |
| Rejected | `rejected` | `rejected` |
| Manual close | `completed` | — |
