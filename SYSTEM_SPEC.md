# SYSTEM_SPEC.md
## ระบบบันทึกรายรับรายจ่าย (Income-Expense Tracker)

**Version:** 1.0
**Architecture Pattern:** Client-owned Data (LocalStorage) + Stateless Serverless Compute Layer
**Target Deployment:** Vercel

---

## 1. Overview

ระบบนี้ออกแบบให้ **Frontend เป็นเจ้าของข้อมูล (Source of Truth)** ผ่าน `localStorage` ของ Browser ผู้ใช้แต่ละคน ในขณะที่ **Backend (Vercel Serverless Function) ทำหน้าที่เป็น Pure Computation Layer** เท่านั้น ไม่มีการเก็บ State ค้างใน Memory ของ Server

เหตุผลเชิงสถาปัตยกรรม: Vercel รัน Backend แบบ Serverless (Function-as-a-Service) ซึ่งไม่รับประกันว่า Instance เดิมจะถูกใช้ซ้ำในทุก Request ดังนั้นการเก็บข้อมูลแบบ In-Memory Array บน Server จะทำให้ข้อมูลหายหรือไม่สอดคล้องกันได้ — สถาปัตยกรรมนี้จึงหลีกเลี่ยงปัญหาดังกล่าวโดยไม่พึ่งพา State บน Server เลย

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5 / CSS3 / Vanilla JS |
| UI Framework | Bootstrap 5 (CDN) |
| Data Persistence | Browser `localStorage` |
| Backend | Node.js (Express) รันในรูปแบบ Vercel Serverless Function |
| Database | ไม่มี (Stateless Compute เท่านั้น) |
| Deployment | Vercel (Frontend + `/api` ในโปรเจกต์เดียวกัน — Same-Origin) |

---

## 3. Data Schema

### 3.1 Transaction Object

```
Transaction {
  id: string          // UUID v4 — สร้างฝั่ง Frontend ด้วย crypto.randomUUID()
  type: string          // enum: "income" | "expense"
  category: string      // เช่น "เงินเดือน", "อาหาร", "ค่าเดินทาง", "บันเทิง"
  amount: number         // เก็บเป็นค่าบวกเสมอ ทิศทางกำหนดจาก type
  date: string           // ISO 8601 เช่น "2026-07-16"
  note: string            // Optional, free text
  createdAt: string       // ISO Timestamp
  updatedAt: string       // ISO Timestamp
}
```

### 3.2 หลักการออกแบบ Schema

- แยก `type` ออกจากเครื่องหมายของ `amount` เพื่อให้ Logic การรวม/กรองข้อมูลเรียบง่าย ไม่ต้องจัดการเครื่องหมายบวก/ลบปะปนกับการคำนวณ
- `id` สร้างที่ฝั่ง Client เนื่องจากระบบเป็น Client-owned data ไม่ต้องรอ Server generate
- `category` ควรมี Master List แยกต่างหาก (Config Array คงที่ฝั่ง Frontend) เพื่อควบคุม Dropdown ใน UI และป้องกันข้อมูลไม่สม่ำเสมอ
- `date` เก็บเป็น string ISO ธรรมดา เพื่อความเข้ากันได้กับ JSON Serialization (JSON ไม่มี native Date type)

### 3.3 LocalStorage Structure

```
Key: "transactions"
Value: JSON.stringify(Transaction[])
```

---

## 4. API Endpoints (แนวทาง A — Stateless Compute)

Backend ไม่มีหน้าที่เก็บข้อมูล มีหน้าที่เพียง **รับ Array ทั้งก้อนจาก Frontend มาประมวลผล แล้วคืนผลลัพธ์กลับไป**

### 4.1 `POST /api/transactions/validate`

ตรวจสอบความถูกต้องของ Transaction object เดี่ยวก่อนบันทึกลง LocalStorage

**Request Body:**
```
{
  transaction: Transaction
}
```

**Response (200):**
```
{
  valid: boolean,
  errors: string[]     // รายการ error หากมี เช่น "amount ต้องมากกว่า 0"
}
```

**Validation Rules ที่ควร enforce:**
- `type` ต้องเป็น `"income"` หรือ `"expense"` เท่านั้น
- `amount` ต้องเป็นตัวเลข และมากกว่า 0
- `date` ต้องเป็น ISO date string ที่ valid
- `category` ห้ามเป็นค่าว่าง

---

### 4.2 `POST /api/summary`

รับ Array รายการทั้งหมดจาก LocalStorage มาคำนวณสรุปยอดภาพรวม

**Request Body:**
```
{
  transactions: Transaction[]
}
```

**Response (200):**
```
{
  totalIncome: number,
  totalExpense: number,
  balance: number,
  byCategory: {
    [category: string]: {
      type: string,
      total: number,
      count: number
    }
  },
  transactionCount: number
}
```

---

### 4.3 `POST /api/summary/monthly`

เหมือน `/api/summary` แต่ Group ผลลัพธ์ตามเดือน สำหรับใช้ทำกราฟ/รายงานรายเดือน

**Request Body:**
```
{
  transactions: Transaction[]
}
```

**Response (200):**
```
{
  months: [
    {
      month: string,          // "2026-07"
      totalIncome: number,
      totalExpense: number,
      balance: number
    }
  ]
}
```

---

### 4.4 หลักการออกแบบ Endpoint

- ทุก Endpoint เป็น **POST** เนื่องจากต้องส่ง Array ข้อมูลทั้งก้อนไปให้ Backend ประมวลผล (ไม่ใช่ GET เพราะไม่มีการอ่านจาก Server-side store)
- Backend ไม่ persist ข้อมูลใดๆ ระหว่าง Request — ทุก Request เป็น pure function: `input Array → output ผลลัพธ์`
- Endpoint เพิ่ม/แก้ไข/ลบรายการ (Create/Update/Delete) **ไม่จำเป็นต้องมี** เพราะ Operation เหล่านี้ทำที่ Client-side โดยตรงกับ LocalStorage อยู่แล้ว ลดความซับซ้อนและ Network Round-trip ที่ไม่จำเป็น

---

## 5. Frontend-Backend Integration Flow

```
[Browser: HTML/Bootstrap/JS]
   │
   ├── localStorage  ← เก็บ Transaction[] (Source of Truth)
   │
   └── fetch() → [Vercel Serverless Function: /api/*]
                      │
                      └── ประมวลผล (Validate / Summary) → คืนผลลัพธ์ (ไม่เก็บ State)
```

### 5.1 ขั้นตอนการทำงาน

1. **โหลดหน้าเว็บ** — JS อ่าน `localStorage.getItem('transactions')` มาแสดงผลทันที ไม่ต้องรอเรียก API
2. **เพิ่ม/แก้ไข/ลบรายการ** — ดำเนินการที่ Client-side ทั้งหมด: อัปเดต Array ใน Memory → เขียนกลับลง `localStorage` → (Optional) เรียก `/api/transactions/validate` ก่อนบันทึกเพื่อตรวจสอบความถูกต้อง
3. **ต้องการสรุปยอด/รายงาน** — ดึง Array ทั้งหมดจาก `localStorage` → ส่งไปที่ `/api/summary` หรือ `/api/summary/monthly` → รับผลลัพธ์กลับมา render บนหน้าจอ (การ์ดสรุปยอด, กราฟ)

### 5.2 Deployment Consideration

- Deploy Frontend และ `/api` folder ไว้ใน Vercel Project เดียวกัน (Vercel Convention) เพื่อให้เป็น **Same-Origin** และไม่ต้องจัดการ CORS
- ควรมี Loading Spinner (Bootstrap Spinner) รองรับทุกครั้งที่เรียก API เนื่องจาก Serverless Function อาจมี Cold Start Delay
- ควรเพิ่มปุ่ม **Export / Import JSON** เพื่อให้ผู้ใช้ย้ายข้อมูลข้ามอุปกรณ์ได้ เนื่องจาก `localStorage` ผูกกับ Browser/Device เดียวเท่านั้น

---

## 6. Non-Goals (สิ่งที่ระบบนี้ตั้งใจไม่ทำ)

- ไม่มี User Authentication / Multi-user support
- ไม่มี Database จริง — ข้อมูลไม่ sync ข้ามอุปกรณ์โดยอัตโนมัติ
- Backend ไม่เก็บ State หรือประวัติการเปลี่ยนแปลงใดๆ ทั้งสิ้น
