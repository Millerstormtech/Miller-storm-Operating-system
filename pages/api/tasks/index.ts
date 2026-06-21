import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { TaskModel } from "../../../src/lib/models/Task";
import { requireAuth } from "../../../src/lib/auth";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await connectMongo();

  if (req.method === "GET") {
    const { assignedTo } = req.query;
    const query: any = {};
    if (assignedTo) {
      query.assignedTo = assignedTo;
    }
    const tasks = await TaskModel.find(query).lean();
    console.log('API GET returning tasks:', tasks);
    res.status(200).json(tasks);
    return;
  }

  if (req.method === "POST") {
    console.log('API POST received:', req.body);
    console.log('req.body.editableFields:', req.body.editableFields);
    
    const { assignedTo, ...taskData } = req.body;
    
    // If assignedTo is an array, create multiple tasks
    if (Array.isArray(assignedTo) && assignedTo.length > 0) {
      const tasks = await Promise.all(
        assignedTo.map((userId: string) => {
          const taskToCreate = {
            ...taskData,
            id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            assignedTo: userId
          };
          console.log('Creating task for user:', userId, taskToCreate);
          console.log('taskToCreate.editableFields:', taskToCreate.editableFields);
          return TaskModel.create(taskToCreate);
        })
      );
      console.log('Tasks created:', tasks);
      res.status(201).json(tasks);
    } else {
      // Single user, create one task
      const task = await TaskModel.create(req.body);
      console.log('Single task created:', task);
      res.status(201).json(task);
    }
    return;
  }

  if (req.method === "PUT") {
    console.log('API PUT received:', req.body);
    console.log('req.body.id:', req.body.id);
    console.log('req.body.editableFields:', req.body.editableFields);
    const { id } = req.body;
    const task = await TaskModel.findOneAndUpdate(
      { id },
      req.body,
      { new: true }
    ).lean();
    console.log('Task updated:', task);
    res.status(200).json(task);
    return;
  }

  if (req.method === "DELETE") {
    const { id } = req.body;
    await TaskModel.findOneAndDelete({ id });
    res.status(204).end();
    return;
  }

  res.setHeader("Allow", "GET, POST, PUT, DELETE");
  res.status(405).end();
}

export default requireAuth(handler);
