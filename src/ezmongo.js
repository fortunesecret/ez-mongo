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
            async () => new this.collection(document).save(),
            this.middleware,
            { before: MongoMiddleware.Hooks.BEFORE_CREATE, after: MongoMiddleware.Hooks.AFTER_CREATE },
            'create', document
        );
    }

    async findById(id)
    {
        return MongoHelperClass.runCRUDOperation(
            async () => this.collection.findById(id).exec(),
            this.middleware,
            { before: MongoMiddleware.Hooks.BEFORE_READ, after: MongoMiddleware.Hooks.AFTER_READ },
            'read', id
        );
    }

    async read(query = {}, projection = {}, options = {})
    {
        return MongoHelperClass.runCRUDOperation(
            async () =>
            {
                const documents = await this.collection.find(query, projection, options).exec();
                return documents.map(doc => new MongoDocument(doc));
            },
            this.middleware,
            { before: MongoMiddleware.Hooks.BEFORE_READ, after: MongoMiddleware.Hooks.AFTER_READ },
            'read', query, projection, options
        );
    }

    async readOne(query = {}, projection = {}, options = {})
    {
        return MongoHelperClass.runCRUDOperation(
            async () =>
            {
                const document = await this.collection.findOne(query, projection, options).exec();
                return document ? new MongoDocument(document) : null;
            },
            this.middleware,
            { before: MongoMiddleware.Hooks.BEFORE_READ, after: MongoMiddleware.Hooks.AFTER_READ },
            'readOne', query, projection, options
        );
    }

    async update(query, updateDoc, options = { new: true })
    {
        return MongoHelperClass.runCRUDOperation(
            async () => this.collection.findOneAndUpdate(query, updateDoc, options).exec(),
            this.middleware,
            { before: MongoMiddleware.Hooks.BEFORE_UPDATE, after: MongoMiddleware.Hooks.AFTER_UPDATE },
            'update', query, updateDoc, options
        );
    }

    async delete(query)
    {
        return MongoHelperClass.runCRUDOperation(
            async () => this.collection.deleteOne(query).exec(),
            this.middleware,
            { before: MongoMiddleware.Hooks.BEFORE_DELETE, after: MongoMiddleware.Hooks.AFTER_DELETE },
            'delete', query
        );
    }

    async deleteMany(query)
    {
        return MongoHelperClass.runCRUDOperation(
            async () => this.collection.deleteMany(query).exec(),
            this.middleware,
            { before: MongoMiddleware.Hooks.BEFORE_DELETE, after: MongoMiddleware.Hooks.AFTER_DELETE },
            'deleteMany', query
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
        this.originalDocument = document;
        this.middleware = new MongoMiddleware();
    }

    async save()
    {
        return MongoHelperClass.runCRUDOperation(
            async () => this.originalDocument.save(),
            this.middleware,
            this.originalDocument.isNew
                ? { before: MongoMiddleware.Hooks.BEFORE_CREATE, after: MongoMiddleware.Hooks.AFTER_CREATE }
                : { before: MongoMiddleware.Hooks.BEFORE_UPDATE, after: MongoMiddleware.Hooks.AFTER_UPDATE },
            this.originalDocument.isNew ? 'create' : 'update',
            this.originalDocument
        ).then((savedDocument) =>
        {
            this.emit(this.originalDocument.isNew ? 'OnCreate' : 'OnUpdate', this);
            return savedDocument;
        });
    }

    async update(updatedFields)
    {
        return MongoHelperClass.runCRUDOperation(
            async () => this.originalDocument.constructor.findOneAndUpdate(
                { _id: this.originalDocument._id },
                { $set: updatedFields },
                { new: true }
            ).exec(),
            this.middleware,
            { before: MongoMiddleware.Hooks.BEFORE_UPDATE, after: MongoMiddleware.Hooks.AFTER_UPDATE },
            'update', updatedFields
        ).then((updatedDocument) =>
        {
            this.emit('OnUpdate', this);
            this.originalDocument = updatedDocument;
            return updatedDocument;
        });
    }

    async delete()
    {
        return MongoHelperClass.runCRUDOperation(
            async () => this.originalDocument.deleteOne(),
            this.middleware,
            { before: MongoMiddleware.Hooks.BEFORE_DELETE, after: MongoMiddleware.Hooks.AFTER_DELETE },
            'delete', this.originalDocument
        ).then((deleteResult) =>
        {
            this.emit('OnDelete', this);
            return deleteResult;
        });
    }

    copy()
    {
        const copiedData = JSON.parse(JSON.stringify(this.originalDocument._doc));
        delete copiedData._id;
        const newMongooseDoc = new this.originalDocument.constructor(copiedData);
        return new MongoDocument(newMongooseDoc);
    }

    use(when, fn)
    {
        this.middleware.use(when, fn);
    }

    on(event, callback)
    {
        this.on(event, callback);
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

    static async runCRUDOperation(operation, middleware, hooks, operationName, ...args)
    {
        try
        {
            await this.runMiddleware(middleware, hooks.before, ...args);
            const result = await operation(...args);
            await this.runMiddleware(middleware, hooks.after, result);
            return result;
        } catch (error)
        {
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
