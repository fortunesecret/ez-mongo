const mongoose = require('mongoose');
const EventEmitter = require('events');

class MongoConnection
{
    constructor(connectionString, dbName)
    {
        this.connectionString = connectionString;
        this.dbName = dbName;
        this.isConnected = false;
    }

    async connect()
    {
        if (!this.isConnected)
        {
            try
            {
                await mongoose.connect(this.connectionString, { useNewUrlParser: true, useUnifiedTopology: true });
                this.isConnected = true;
                console.log(`Connected to ${this.dbName}`);
            } catch (error)
            {
                console.error('Error connecting to database:', error);
                throw error;
            }
        }
    }

    async close()
    {
        if (this.isConnected)
        {
            try
            {
                await mongoose.disconnect();
                this.isConnected = false;
                console.log('Disconnected from database');
            } catch (error)
            {
                console.error('Error disconnecting from database:', error);
                throw error;
            }
        }
    }

    async getCollection(collectionName)
    {
        await MongoHelperClass.ensureConnected(this);
        return new MongoCollection(mongoose.model(collectionName));
    }

    createCollection(collectionName, schemaDefinition = {})
    {
        const schema = new mongoose.Schema(schemaDefinition, { timestamps: true });
        return mongoose.model(collectionName, schema);
    }
}


class MongoCollection
{
    constructor(collection)
    {
        this.collection = collection;
        this.middleware = new MongoMiddleware();
    }

    async create(document)
    {
        return MongoHelperClass.runCRUDOperation(
            async () =>
            {
                const newDocument = new this.collection(document);
                return newDocument.save();
            },
            this.middleware,
            { before: MongoMiddleware.Hooks.BEFORE_CREATE, after: MongoMiddleware.Hooks.AFTER_CREATE },
            document
        );
    }

    // Find a document by its ID and return a MongoDocument instance
    async findById(id)
    {
        return MongoHelperClass.runCRUDOperation(
            async () =>
            {
                const document = await this.collection.findById(id).exec();
                if (!document)
                {
                    throw new Error(`Document with ID ${id} not found`);
                }
                return new MongoDocument(document); // Wrap it in MongoDocument
            },
            this.middleware,
            { before: MongoMiddleware.Hooks.BEFORE_READ, after: MongoMiddleware.Hooks.AFTER_READ },
            id
        );
    }

    async read(query = {}, projection = {}, options = {}) {
        return MongoHelperClass.runCRUDOperation(
            async () => {
                const documents = await this.collection.find(query, projection, options).exec();
                return documents.map(doc => new MongoDocument(doc)); // Wrap in MongoDocument
            },
            this.middleware,
            { before: MongoMiddleware.Hooks.BEFORE_READ, after: MongoMiddleware.Hooks.AFTER_READ },
            query, projection, options
        );
    }
    
    async readOne(query = {}, projection = {}, options = {}) {
        return MongoHelperClass.runCRUDOperation(
            async () => {
                const document = await this.collection.findOne(query, projection, options).exec();
                return document ? new MongoDocument(document) : null; // Wrap in MongoDocument
            },
            this.middleware,
            { before: MongoMiddleware.Hooks.BEFORE_READ, after: MongoMiddleware.Hooks.AFTER_READ },
            query, projection, options
        );
    }
    
    async update(query, updateDoc, options = { new: true })
    {
        return MongoHelperClass.runCRUDOperation(
            async () => this.collection.findOneAndUpdate(query, updateDoc, options).exec(),
            this.middleware,
            { before: MongoMiddleware.Hooks.BEFORE_UPDATE, after: MongoMiddleware.Hooks.AFTER_UPDATE },
            query, updateDoc, options
        );
    }

    async delete(query)
    {
        return MongoHelperClass.runCRUDOperation(
            async () => this.collection.deleteOne(query).exec(),
            this.middleware,
            { before: MongoMiddleware.Hooks.BEFORE_DELETE, after: MongoMiddleware.Hooks.AFTER_DELETE },
            query
        );
    }

    async deleteMany(query)
    {
        return MongoHelperClass.runCRUDOperation(
            async () => this.collection.deleteMany(query).exec(),
            this.middleware,
            { before: MongoMiddleware.Hooks.BEFORE_DELETE, after: MongoMiddleware.Hooks.AFTER_DELETE },
            query
        );
    }

    use(when, fn)
    {
        this.middleware.use(when, fn);
    }
}

class MongoDocument extends EventEmitter
{
    constructor(document)
    {
        super();
        this.originalDocument = document;  // Mongoose document instance
        this.middleware = new MongoMiddleware(); // Add middleware to the document level
    }

    async save() {
        return MongoHelperClass.runCRUDOperation(
            async () => this.originalDocument.isNew ? this.originalDocument.save() : this.update(this.originalDocument),
            this.middleware,
            this.originalDocument.isNew
                ? { before: MongoMiddleware.Hooks.BEFORE_CREATE, after: MongoMiddleware.Hooks.AFTER_CREATE }
                : { before: MongoMiddleware.Hooks.BEFORE_UPDATE, after: MongoMiddleware.Hooks.AFTER_UPDATE },
            this.originalDocument
        ).then((savedDocument) => {
            this.emit(this.originalDocument.isNew ? 'OnCreate' : 'OnUpdate', this);
            this.document = savedDocument;
            return savedDocument;
        });
    }
    
    // Perform a partial update
    async update(updatedFields)
    {
        return MongoHelperClass.runCRUDOperation(
            async () => this.originalDocument.constructor.findOneAndUpdate(
                { _id: this.originalDocument._id },  // Find the document by ID
                { $set: updatedFields },              // Only update the provided fields
                { new: true }                         // Return the updated document
            ).exec(),
            this.middleware,
            { before: MongoMiddleware.Hooks.BEFORE_UPDATE, after: MongoMiddleware.Hooks.AFTER_UPDATE },
            updatedFields
        ).then((updatedDocument) =>
        {
            this.emit('OnUpdate', this); // Trigger update event
            this.originalDocument = updatedDocument; // Update the document instance
            return updatedDocument;
        });
    }

    async delete()
    {
        return MongoHelperClass.runCRUDOperation(
            async () => this.originalDocument.deleteOne(),  // Use Mongoose's delete method
            this.middleware,
            { before: MongoMiddleware.Hooks.BEFORE_DELETE, after: MongoMiddleware.Hooks.AFTER_DELETE },
            this.originalDocument
        ).then((deletedDocument) =>
        {
            this.emit('OnDelete', this);
            return deletedDocument;
        });
    }


    // Create a deep copy of the current document, returning a new MongoDocument instance
    copy()
    {
        // Deep copy the document data (excluding _id to ensure a new document is created when saved)
        const copiedData = JSON.parse(JSON.stringify(this.originalDocument._doc)); // Clone the document
        delete copiedData._id; // Remove the _id field to make the copy independent

        // Create a new Mongoose document from the copied data
        const newMongooseDoc = new this.originalDocument.constructor(copiedData);

        // Return a new MongoDocument instance wrapping the copied Mongoose document
        return new MongoDocument(newMongooseDoc);
    }

    use(when, fn)
    {
        this.middleware.use(when, fn);
    }

    onSave(callback)
    {
        this.on('OnSave', callback);
    }

    onUpdate(callback)
    {
        this.on('OnUpdate', callback);
    }

    onDelete(callback)
    {
        this.on('OnDelete', callback);
    }
}

class MongoMiddleware
{
    constructor()
    {
        this.middlewareStack = {
            [MongoMiddleware.Hooks.BEFORE_CREATE]: [],
            [MongoMiddleware.Hooks.AFTER_CREATE]: [],
            [MongoMiddleware.Hooks.BEFORE_READ]: [],
            [MongoMiddleware.Hooks.AFTER_READ]: [],
            [MongoMiddleware.Hooks.BEFORE_UPDATE]: [],
            [MongoMiddleware.Hooks.AFTER_UPDATE]: [],
            [MongoMiddleware.Hooks.BEFORE_DELETE]: [],
            [MongoMiddleware.Hooks.AFTER_DELETE]: []
        };
    }

    static Hooks = {
        BEFORE_CREATE: 'beforeCreate',
        AFTER_CREATE: 'afterCreate',
        BEFORE_READ: 'beforeRead',
        AFTER_READ: 'afterRead',
        BEFORE_UPDATE: 'beforeUpdate',
        AFTER_UPDATE: 'afterUpdate',
        BEFORE_DELETE: 'beforeDelete',
        AFTER_DELETE: 'afterDelete'
    };

    use(when, fn)
    {
        if (this.middlewareStack[when])
        {
            this.middlewareStack[when].push(fn);
        } else
        {
            throw new Error(`Invalid middleware hook: ${when}`);
        }
    }

    async run(when, ...args)
    {
        const fns = this.middlewareStack[when] || [];
        for (let fn of fns)
        {
            await fn(...args);
        }
    }
}

class MongoHelperClass
{

    static async runMiddleware(middleware, hook, ...args)
    {
        if (!middleware)
        {
            throw new Error('Middleware instance is required');
        }

        if (!MongoMiddleware.Hooks[hook])
        {
            throw new Error(`Invalid middleware hook: ${hook}`);
        }

        await middleware.run(hook, ...args);
    }

    static async ensureConnected(connection)
    {
        if (!connection || typeof connection.connect !== 'function')
        {
            throw new Error('Invalid connection instance');
        }

        if (!connection.isConnected)
        {
            await connection.connect();
        }
    }
    static async runCRUDOperation(operation, middleware, hooks, operationName, ...args) {
        try {
            // Before operation middleware
            await this.runMiddleware(middleware, hooks.before, ...args);
    
            // Perform the operation (e.g., save, update, read)
            const result = await operation(...args);
    
            // After operation middleware
            await this.runMiddleware(middleware, hooks.after, result);
    
            return result;
        } catch (error) {
            console.error(`Error during ${operationName} operation:`, error);
            throw error;
        }
    }    
}


module.exports = {
    MongoConnection,
    MongoCollection,
    MongoDocument,
    MongoMiddleware,
    MongoHelperClass
};