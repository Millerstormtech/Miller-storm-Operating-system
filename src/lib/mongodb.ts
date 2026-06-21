import mongoose from "mongoose";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/millerstorm";

type MongooseGlobal = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalForMongoose = globalThis as typeof globalThis & {
  mongoose?: MongooseGlobal;
};

if (!globalForMongoose.mongoose) {
  globalForMongoose.mongoose = { conn: null, promise: null };
}

export async function connectMongo() {
  if (globalForMongoose.mongoose?.conn) {
    return globalForMongoose.mongoose.conn;
  }

  if (!globalForMongoose.mongoose?.promise) {
    globalForMongoose.mongoose = {
      conn: null,
      promise: mongoose.connect(uri, {
        dbName: "millerstorm",
        serverSelectionTimeoutMS: 10000, // 10 second timeout
        socketTimeoutMS: 45000, // 45 second socket timeout
        maxPoolSize: 10,
        minPoolSize: 2,
        maxIdleTimeMS: 30000
      })
    };
  }

  globalForMongoose.mongoose.conn = await globalForMongoose.mongoose.promise;
  return globalForMongoose.mongoose.conn;
}
