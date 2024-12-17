const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const username = encodeURIComponent(process.env.MONGODB_USER);
const password = encodeURIComponent(process.env.MONGODB_PASSWORD);
const cluster = process.env.MONGODB_CLUSTER;
const dbName = process.env.MONGODB_DB_NAME;
const appName = process.env.MONGODB_APP_NAME;

const uri = `mongodb+srv://${username}:${password}@${cluster}/?retryWrites=true&w=majority&appName=${appName}`;

let dbInstance = null;

async function connectToDatabase() {
    if (dbInstance) return dbInstance;

    const client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
        },
    });

    try {
        console.log('Connecting to MongoDB...');
        await client.connect();
        console.log('Successfully connected to MongoDB');

        dbInstance = client.db(dbName);
        return dbInstance;
    } catch (error) {
        console.error('Error connecting to MongoDB:', error.message);
        process.exit(1);
    }
}

async function clearConversationsCollection() {
    try {
        const db = await connectToDatabase();
        const collection = db.collection('conversations');
        const result = await collection.deleteMany({});
        console.log(`Cleared ${result.deletedCount} documents from 'conversations' collection.`);
    } catch (error) {
        console.error('Error clearing conversations collection:', error.message);
    }
}

async function listDatabaseCollections() {
    try {
        const db = await connectToDatabase();
        const collections = await db.listCollections().toArray();
        console.log('Connected Database Collections:', collections.map(col => col.name));
    } catch (error) {
        console.error('Error listing database collections:', error.message);
    }
}

async function verifyDatabaseConnection() {
    try {
        console.log('Verifying database connection...');
        await connectToDatabase();
        await listDatabaseCollections();
        console.log('Database connection verification completed successfully.');
    } catch (error) {
        console.error('Database verification failed:', error.message);
    }
}

module.exports = connectToDatabase;

/**
 * To verify connection and clear 'conversations':
 * Uncomment and run:
 * clearConversationsCollection();
 * verifyDatabaseConnection();
 */
