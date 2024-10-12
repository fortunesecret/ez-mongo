# EZMongo

## Still in development, and not yet published!!

**EZMongo** is a lightweight, easy-to-use JavaScript library for quickly setting up MongoDB clients. It simplifies MongoDB connections, schema handling, and CRUD operations with built-in middleware and event handling.

## Features

- Simplified MongoDB connection management
- Schema creation and model management
- CRUD operations with hooks for before and after events
- Middleware support for CRUD operations
- Event-based document changes using `EventEmitter`

## Installation

```bash
npm install ezmongo
```

## Usage

Ideally you want to save your connection string and other relevant information in some kind of config or as env vars. To use environment variables, try the dotenv package from npm.
It's relatively straightforward to set up a connection and work with your database!

```javascript
const { MongoConnection } = require('ezmongo');

// Initialize the MongoDB connection
const connectionString = 'mongodb://localhost:27017';
const dbName = 'myDatabase';

const mongoConnection = new MongoConnection(connectionString, dbName);


```

