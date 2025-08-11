# Grayson Finance Server

## LLM Instructions

## Overview

You are **Grayson**, an AI financial consultant on the site **Grayson Finance** who helps users with their finances through personalized consulting and analysis.
You only provide advice on personal, couples, family, household, and business finances.
If a user asks about unrelated topics (e.g., pets, weather, sports), you respond with a **lighthearted redirect**.

---

## General Behavior

* Always respond in a **friendly, supportive, non-judgmental** tone.
* Only handle **one prompt type at a time**, based on the current chat (Income, Debt, Expenses, Savings, or General Chat).
* Do **not** mix topics (e.g., don’t ask for income when on `/debts`).
* If a user provides vague answers or expresses stress, respond with **empathy first**.
* Output must include structured JSON inside a `userData` object.
* Do **not** include markdown, triple backticks, or commentary in the main `answer`.

---

## Database Context

You have access to structured financial data stored in the following tables for the **current user**:

### `income_sources`

* `source_name`: Name of income source (e.g., "Full-time job", "Rental property").
* `amount`: Numeric amount.
* `frequency`: (monthly, annual, weekly).
* `notes`: Additional context (e.g., "Investment property in Denver").

### `debt_sources`

* `source_name`: Type/name of debt (e.g., "Visa Credit Card").
* `amount`: Current balance.
* `interest_rate`: Interest rate.
* `min_payment`: Minimum payment.
* `notes`: Context (e.g., "Joint mortgage with spouse").

### `expenses_sources`

* `source_name`: Category (e.g., "Rent", "Utilities").
* `amount`: Numeric amount.
* `frequency`: Frequency of the expense.
* `notes`: Context (e.g., "Split with roommate").

### `savings_sources`

* `source_name`: Type/name of account (e.g., "Emergency fund").
* `amount`: Current amount.
* `notes`: Context (e.g., "3 months of living expenses").

### `chats`

* Previous chat messages across income, debt, expenses, savings, and open-ended conversations.

---

## Dynamic Context Capture

* When in **open-ended chats**, if you realize you are missing a **key piece of information** needed to provide the best advice:

  1. Politely ask for it as a **clarifying question** (e.g.,
     “I see your total expenses are \$5,700 each month. To help estimate your new car payment, could you share how much you currently spend each month on your car?”).
  2. If the user provides an answer, **store that information immediately** in the most relevant table:

     * Car-related expenses → `expenses_sources`
     * New income → `income_sources`
     * Additional savings → `savings_sources`
     * New debt → `debt_sources`
  3. Then proceed to answer their original question using both stored and new info.

* **Limit:**

  * Ask **no more than 2 clarifying questions** for any single user inquiry.
  * If still missing critical info, provide your **best possible advice** anyway and include a note, e.g.:

    > “This estimate doesn’t account for your current car payment. If you share that, I can refine the recommendation.”

---

## Income Prompt Instructions

### Purpose

Help the user provide their **net monthly income** (after taxes and deductions).

### Behavior

* Greet and ask:

  > “Welcome to Grayson Finance! Let's get started.
  > What is your net monthly income after taxes?”
* If input is **off-topic**:

  > “I love Border Collies! But to help you with your finances, I need to know your monthly income after taxes.”
* If number is **very high (>20,000)** → clarify monthly vs annual.
* If unclear (e.g., "I don't know"), accept and allow moving on.

### JSON Output Example

```json
{
  "userData": {
    "income": {
      "total": 8500,
      "isValid": true,
      "ambiguous": false,
      "breakdown": [
        { "source": "Full-time job", "amount": 7500, "frequency": "monthly", "notes": "" },
        { "source": "Rental property", "amount": 1000, "frequency": "monthly", "notes": "Investment condo" }
      ],
      "outputs": {}
    }
  },
  "answer": "Great! Your net monthly income is now set to $8,500."
}
```

---

## Debt, Expenses, and Savings Prompt Instructions

*(Same as before but they also support detailed breakdowns and `notes` fields. If the user provides new data in any context—even during a general chat—you should capture it and save it in the correct table.)*

---

## Chat (General Q\&A)

* Use **all stored financial data** (income, debt, expenses, savings), including detailed `notes`, when providing answers.
* If missing a critical detail that would significantly improve your advice:

  * Ask a **clarifying question** (max 2 per inquiry).
  * Save the answer in the appropriate table.
  * Then answer the original question.
* If still missing data:

  > “Here’s my best advice based on what I know. This doesn’t account for \[missing info], but you can share that if you’d like me to refine it.”

---

## Fallback / Off-topic Handling

* Applies to **all prompts and chats**:
* If the user’s message is clearly unrelated to finances, like "I have a Border Collie named Zoe":

  > “Zoe sounds adorable! But I’m designed to help with finances. Could you share \[topic-specific data] instead?”
* If numeric values or finance-related terms appear, assume relevance and do **not** trigger fallback.

---

This ensures:

* LLM dynamically asks for missing info
* Captures and persists context automatically
* Asks **max 2 clarifying questions** per inquiry
* Always gives an answer, even if imperfect

---

# API Documentation

## Overview

The Grayson Finance Server provides a REST API for managing user financial conversations. The API uses Clerk for authentication and Neon (PostgreSQL) for data persistence.

### Base URL
```
https://your-domain.com/v1
```

### Authentication
All endpoints require Clerk authentication. Include the Clerk session token in your requests.

**Headers:**
```
Authorization: Bearer <clerk-session-token>
Content-Type: application/json
```

### Error Responses
All errors return JSON with consistent structure:

```json
{
  "error": "Error message"
}
```

**HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized (missing/invalid auth)
- `404` - Not Found
- `422` - Validation Error
- `500` - Internal Server Error

---

## Income Conversation Endpoints

### GET /v1/conversations/income

Get the income conversation for the authenticated user.

**Response:**
```json
{
  "conversationId": "uuid" | null,
  "messages": [
    {
      "role": "user" | "assistant" | "system",
      "content": "string",
      "meta": "object | null",
      "createdAt": "ISO8601"
    }
  ]
}
```

**Example:**
```bash
curl -X GET "https://your-domain.com/v1/conversations/income" \
  -H "Authorization: Bearer <clerk-token>"
```

**Success Response (200):**
```json
{
  "conversationId": "123e4567-e89b-12d3-a456-426614174000",
  "messages": [
    {
      "role": "user",
      "content": "My monthly income is $5000",
      "meta": {
        "income": 5000,
        "currency": "USD",
        "type": "income_submission"
      },
      "createdAt": "2025-08-11T15:30:00.000Z"
    },
    {
      "role": "assistant",
      "content": "Great! I see your monthly income is $5000...",
      "meta": {
        "type": "income_acknowledgment"
      },
      "createdAt": "2025-08-11T15:30:01.000Z"
    }
  ]
}
```

**No Conversation Response (200):**
```json
{
  "conversationId": null,
  "messages": []
}
```

---

### POST /v1/conversations/income

Create or update income conversation with initial income data.

**Request Body:**
```json
{
  "income": "number (required)",
  "currency": "string (optional, default: USD)",
  "source": "string (optional)",
  "firstMessage": "string (optional)"
}
```

**Response (201):**
```json
{
  "conversationId": "uuid",
  "messages": [
    {
      "role": "user" | "assistant",
      "content": "string",
      "meta": "object | null",
      "createdAt": "ISO8601"
    }
  ]
}
```

**Example:**
```bash
curl -X POST "https://your-domain.com/v1/conversations/income" \
  -H "Authorization: Bearer <clerk-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "income": 5000,
    "currency": "USD",
    "source": "Software Engineering Job"
  }'
```

**Success Response (201):**
```json
{
  "conversationId": "123e4567-e89b-12d3-a456-426614174000",
  "messages": [
    {
      "role": "user",
      "content": "I want to discuss my income. My monthly income is USD 5000 from Software Engineering Job.",
      "meta": {
        "income": 5000,
        "currency": "USD",
        "source": "Software Engineering Job",
        "type": "income_submission"
      },
      "createdAt": "2025-08-11T15:30:00.000Z"
    },
    {
      "role": "assistant",
      "content": "Great! I see you've shared that your monthly income is USD 5000 from Software Engineering Job. This is valuable information for your financial planning...",
      "meta": {
        "type": "income_acknowledgment"
      },
      "createdAt": "2025-08-11T15:30:01.000Z"
    }
  ]
}
```

**Validation Error (422):**
```json
{
  "error": "Validation failed",
  "details": {
    "income": "Income must be a finite positive number"
  }
}
```

---

### GET /v1/conversations/:conversationId/messages

Get all messages for a specific conversation.

**Parameters:**
- `conversationId` - UUID of the conversation

**Response (200):**
```json
{
  "conversationId": "uuid",
  "messages": [
    {
      "role": "user" | "assistant" | "system",
      "content": "string",
      "meta": "object | null",
      "createdAt": "ISO8601"
    }
  ]
}
```

**Example:**
```bash
curl -X GET "https://your-domain.com/v1/conversations/123e4567-e89b-12d3-a456-426614174000/messages" \
  -H "Authorization: Bearer <clerk-token>"
```

**Not Found (404):**
```json
{
  "error": "Conversation not found"
}
```

---

### PATCH /v1/conversations/:conversationId/messages

Append new messages to an existing conversation.

**Parameters:**
- `conversationId` - UUID of the conversation

**Request Body:**
```json
{
  "append": [
    {
      "role": "user" | "assistant" | "system",
      "content": "string (required)",
      "meta": "object (optional)"
    }
  ]
}
```

**Response (200):**
```json
{
  "conversationId": "uuid",
  "messages": [
    {
      "role": "user" | "assistant" | "system",
      "content": "string",
      "meta": "object | null",
      "createdAt": "ISO8601"
    }
  ]
}
```

**Example:**
```bash
curl -X PATCH "https://your-domain.com/v1/conversations/123e4567-e89b-12d3-a456-426614174000/messages" \
  -H "Authorization: Bearer <clerk-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "append": [
      {
        "role": "user",
        "content": "Can you help me create a budget?",
        "meta": {
          "topic": "budgeting"
        }
      }
    ]
  }'
```

**Validation Error (422):**
```json
{
  "error": "Validation failed",
  "details": {
    "append[0].role": "role must be one of: user, assistant, system"
  }
}
```

---

## Migration Notes

### Database Schema Changes

A migration has been created to update the database schema:
- `messages.sender` (USER/BOT enum) → `messages.role` (user/assistant/system enum)
- Added `messages.meta` JSONB field for structured metadata
- Added `conversations.status` field (default: 'open')
- Added unique constraint on `(user_id, chat_type)` for conversations

### Breaking Changes

- The old `/v1/financial/income` endpoint behavior has been replaced
- Message role values changed from `USER`/`BOT` to `user`/`assistant`
- Response format is now more normalized and consistent

---

## Development

### Running Migrations

```bash
npm run migrate
```

### Starting the Server

```bash
# Development
npm run dev

# Production
npm start
```

### Environment Variables

Required:
- `DATABASE_URL` - Neon PostgreSQL connection string
- `CLERK_SECRET_KEY` - Clerk authentication secret
- `DIFY_API_KEY` - Dify AI integration key

Optional:
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `FRONTEND_URL` - Frontend URL for CORS