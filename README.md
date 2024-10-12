# EZMongo
## Still in Development — Not Yet Published!

EZMongo is a lightweight, easy-to-use JavaScript library for quickly setting up MongoDB clients. It simplifies MongoDB connections, schema handling, and CRUD operations with built-in middleware and event handling, making it easier to interact with MongoDB databases.

## Features
- MongoDB Connection Management: Easy setup for MongoDB connections with automatic connection checks.
-Schema Creation & Model Management: Define schemas and models with Mongoose.
-CRUD Operations: Simplified create, read, update, and delete operations.
-Middleware Support: Attach middleware to any CRUD operation (before and after).
-Event-Driven Document Changes: Leverages EventEmitter for real-time events when documents are created, updated, or deleted.
-Document Cloning: Create deep copies of MongoDB documents, excluding the _id field to allow saving as new entries.

## Installation
First, install EZMongo using npm:

```bash
npm install ezmongo
```

## Getting Started
Before you start, it's recommended to store your connection string and database credentials in environment variables. You can use the dotenv package to load these variables:

```bash
npm install dotenv
```

Example .env file:

```bash
MONGO_URI=mongodb://localhost:27017
MONGO_DB=myDatabase
```

Then, load environment variables at the start of your application:

```javascript
require('dotenv').config();
const { MongoConnection } = require('ezmongo');

// Initialize the MongoDB connection using environment variables
const connectionString = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB;

const mongoConnection = new MongoConnection(connectionString, dbName);

// Connect to MongoDB
mongoConnection.connect()
    .then(() => console.log('Connected to the database!'))
    .catch((err) => console.error('Database connection failed:', err));
```

## Working with Collections and Documents

### Creating a Collection

To create a new collection and define its schema, use createCollection:

```javascript
const schemaDefinition = {
    name: String,
    age: Number,
    email: { type: String, required: true, unique: true },
};

const User = mongoConnection.createCollection('User', schemaDefinition);
```

## Performing CRUD Operations

CRUD operations are straightforward with EZMongo, and you can apply middleware and listen for document changes via events.

### Create a Document

```javascript
async function createUser() {
    const userCollection = await mongoConnection.getCollection('User');
    
    // Create a new document
    const user = { name: 'John Doe', age: 30, email: 'john@example.com' };
    await userCollection.create(user);
    console.log('User created!');
}

createUser();
```

### Read Documents

```javascript
async function getUserById(userId) {
    const userCollection = await mongoConnection.getCollection('User');
    
    // Find a document by ID
    const user = await userCollection.findById(userId);
    console.log('Found user:', user);
}

getUserById('60b8d295f08e0c1a44357f1d'); // Example ID
```

### Update a Document

``` javascript
async function updateUser(userId) {
    const userCollection = await mongoConnection.getCollection('User');
    
    // Update the user’s age
    const updatedFields = { age: 35 };
    await userCollection.update({ _id: userId }, updatedFields);
    console.log('User updated!');
}

updateUser('60b8d295f08e0c1a44357f1d');
```

### Delete a Document

``` javascript
async function deleteUser(userId) {
    const userCollection = await mongoConnection.getCollection('User');
    
    await userCollection.delete({ _id: userId });
    console.log('User deleted!');
}

deleteUser('60b8d295f08e0c1a44357f1d');
```

## Middleware

You can attach middleware to run before or after any CRUD operation. Middleware functions can be used for logging, validation, or modifying data before it is saved or after it's read.

```javascript
// Example middleware function for logging
mongoConnection.use('beforeCreate', async (document) => {
    console.log('About to create a document:', document);
});

mongoConnection.use('afterCreate', async (document) => {
    console.log('Document created:', document);
});
```

## Event Handling with EventEmitter

Each MongoDocument emits events when a document is saved, updated, or deleted.

```javascript
const userDoc = await userCollection.findById('60b8d295f08e0c1a44357f1d');

// Listen for the update event
userDoc.on('OnUpdate', (doc) => {
    console.log('Document updated:', doc);
});

// Update the document to trigger the event
await userDoc.update({ age: 40 });
Cloning Documents
You can create a copy of a document and save it as a new entry:

javascript
const userDoc = await userCollection.findById('60b8d295f08e0c1a44357f1d');

// Create a deep copy of the document
const copiedDoc = userDoc.copy();

// Modify the copy and save it as a new document
copiedDoc.Property.age = 25;
await copiedDoc.save();
console.log('Copied document saved as a new entry!');
```

## License

EZMongo is open source and available under the MIT License.
