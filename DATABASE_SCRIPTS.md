# Database & Prisma Scripts Guide

This document explains all the database and Prisma scripts available in this project, when to use them, and which ones you'll need most frequently.

## 🔥 Most Frequently Used Scripts

These are the scripts you'll likely run most often during development:

### `npm run dev`
**What it does:** Starts the server with nodemon for auto-restart on file changes  
**When to use:** Every time you start development work  
**Frequency:** ⭐⭐⭐⭐⭐ (Daily)

### `npm run db:migrate`
**What it does:** Creates a new migration file for schema changes and applies it to your development database  
**When to use:** After making changes to `prisma/schema.prisma`  
**Frequency:** ⭐⭐⭐⭐ (Several times per week)

### `npm run db:generate`
**What it does:** Regenerates the Prisma client based on your current schema  
**When to use:** After pulling code with schema changes or after running migrations  
**Frequency:** ⭐⭐⭐⭐ (Several times per week)

### `npm run db:studio`
**What it does:** Opens Prisma Studio - a visual database browser and editor  
**When to use:** When you need to view, add, edit, or delete data in your database  
**Frequency:** ⭐⭐⭐ (Few times per week)

---

## 📋 All Available Scripts

### Development Scripts

#### `npm run dev`
- **Purpose:** Development server with auto-restart
- **When to use:** Starting your development session
- **What happens:** Starts the server using nodemon, automatically restarts when files change

#### `npm start`
- **Purpose:** Production server start
- **When to use:** In production or when you don't need auto-restart
- **What happens:** Starts the server with Node.js directly

### Prisma Client Management

#### `npm run db:generate`
- **Purpose:** Generate/update Prisma client
- **When to use:** 
  - After schema changes
  - After pulling code with new migrations
  - When Prisma client seems out of sync
- **What happens:** Reads your schema and generates TypeScript types and client code

### Database Migrations

#### `npm run db:migrate`
- **Purpose:** Create and apply development migrations
- **When to use:** After changing your `prisma/schema.prisma` file
- **What happens:** 
  - Creates a new migration file
  - Applies it to your development database
  - Updates the database schema

#### `npm run db:migrate:deploy`
- **Purpose:** Deploy migrations to production
- **When to use:** In CI/CD pipelines or when deploying to production
- **What happens:** Applies pending migrations without prompting

#### `npm run db:migrate:reset`
- **Purpose:** Reset database and rerun all migrations
- **When to use:** When your migration history is corrupted or you need a clean slate
- **What happens:** 
  - Drops and recreates the database
  - Runs all migrations from scratch
  - Prompts for confirmation

#### `npm run db:status`
- **Purpose:** Check migration status
- **When to use:** To see which migrations have been applied
- **What happens:** Shows pending and applied migrations

### Database Schema Management

#### `npm run db:push`
- **Purpose:** Push schema changes directly to database (bypasses migrations)
- **When to use:** 
  - During rapid prototyping
  - In development when you don't want to create migration files
- **What happens:** Updates database schema to match your Prisma schema
- **⚠️ Warning:** Use carefully - doesn't create migration history

#### `npm run db:pull`
- **Purpose:** Pull database schema into Prisma schema
- **When to use:** 
  - When database was changed outside of Prisma
  - Reverse-engineering an existing database
- **What happens:** Updates your `prisma/schema.prisma` to match the database

### Database Tools

#### `npm run db:studio`
- **Purpose:** Visual database browser and editor
- **When to use:** 
  - Viewing data
  - Adding test data
  - Debugging data issues
  - Quick database edits
- **What happens:** Opens Prisma Studio in your browser (usually at http://localhost:5555)

#### `npm run db:seed`
- **Purpose:** Run database seeding scripts
- **When to use:** To populate database with initial/test data
- **What happens:** Runs your seed script (if configured)
- **Note:** Requires a seed script to be configured in `package.json`

### Database Reset & Fresh Setup

#### `npm run db:reset`
- **Purpose:** Force reset database and regenerate client
- **When to use:** When you need a completely clean database state
- **What happens:** 
  - Resets database (with --force flag)
  - Generates Prisma client
- **⚠️ Warning:** Destructive operation - all data will be lost

#### `npm run db:fresh`
- **Purpose:** Complete fresh database setup
- **When to use:** 
  - Setting up development environment
  - After major schema changes
  - When database is in an inconsistent state
- **What happens:** 
  - Resets database
  - Runs all migrations
  - Generates client
- **⚠️ Warning:** Destructive operation - all data will be lost

### Schema Utilities

#### `npm run prisma:format`
- **Purpose:** Format Prisma schema file
- **When to use:** To clean up formatting in `prisma/schema.prisma`
- **What happens:** Automatically formats your schema file

---

## 🔄 Common Workflows

### Starting Development
```bash
npm run dev
```

### After Changing Schema
```bash
npm run db:migrate
npm run db:generate
```

### After Pulling Code with Schema Changes
```bash
npm run db:generate
# or if there are new migrations:
npm run db:migrate
```

### Setting Up Fresh Database
```bash
npm run db:fresh
```

### Viewing/Editing Data
```bash
npm run db:studio
```

---

## ⚠️ Important Notes

- **Always backup your data** before running destructive commands (`db:reset`, `db:fresh`)
- **Use `db:push` carefully** in development - it doesn't create migration history
- **Run `db:generate`** after any schema changes or when switching branches
- **Use `db:studio`** for quick data inspection and editing
- **Keep migrations in version control** - they're part of your application history

---

## 🆘 Troubleshooting

### "Prisma Client is not up to date"
Run: `npm run db:generate`

### "Database is out of sync"
Run: `npm run db:migrate`

### "Migration failed"
1. Check your schema for errors
2. Run: `npm run db:migrate:reset` (if safe to lose data)  
3. Or fix the migration manually and retry

### "Need a completely fresh start"
Run: `npm run db:fresh` (⚠️ loses all data)