import mongoose from "mongoose";
import { UserModel } from "./src/lib/models/User.js";
import { CourseModel } from "./src/lib/models/Course.js";
import { mockUsers } from "./src/data/mockUsers.js";
import { initialCourses } from "./src/data/courses.js";

const uri = "mongodb://localhost:27017/millerstorm";

async function seed() {
  await mongoose.connect(uri, { dbName: "millerstorm" });
  
  await UserModel.deleteMany({});
  await CourseModel.deleteMany({});
  
  await UserModel.insertMany(mockUsers);
  await CourseModel.insertMany(initialCourses);
  
  console.log("✅ Seeded users:", mockUsers.length);
  console.log("✅ Seeded courses:", initialCourses.length);
  
  await mongoose.disconnect();
}

seed().catch(console.error);
