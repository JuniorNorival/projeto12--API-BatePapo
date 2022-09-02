import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();
import { MongoClient, ObjectId } from "mongodb";
import joi from "joi";
import dayjs from "dayjs";

const app = express();
app.use(cors());
app.use(express.json());

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

mongoClient.connect().then(() => {
  db = mongoClient.db("bate-papo-uol");
});

const participantsSchema = joi.object({
  name: joi.string().required().trim(true),
});

const messagesSchema = joi.object({
  to: joi.string().required(),
  text: joi.string().required(),
  type: joi.string().valid("message", "private_message").required(),
});

app.post("/participants", async (req, res) => {
  const { name } = req.body;
  const validation = participantsSchema.validate(req.body);

  if (validation.error) {
    res.sendStatus(422);
    return;
  }

  const existentName = await db
    .collection("participants")
    .findOne({ name: name });

  if (existentName) {
    res.sendStatus(409);
    return;
  }

  try {
    await db.collection("participants").insertOne({
      name: name,
      lastStatus: Date.now(),
    });
    await db.collection("messages").insertOne({
      from: name,
      to: "Todos",
      text: "Entrou na sala...",
      type: "status",
      time: dayjs().format("HH:mm:ss"),
    });
    res.sendStatus(201);
  } catch (error) {
    res.sendStatus(500);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const response = await db.collection("participants").find().toArray();
    res.send(response);
  } catch (error) {
    res.sendStatus(500);
  }
});

app.post("/messages", async (req, res) => {
  const { to, text, type } = req.body;
  const validation = messagesSchema.validate(req.body);
  const { user } = req.headers;

  const participantsValid = await db
    .collection("participants")
    .findOne({ name: user });

  const activeParticipants = await db
    .collection("participants")
    .findOne({ name: to });

  if (validation.error || !participantsValid) {
    res.sendStatus(422);
    return;
  }
  try {
    await db.collection("messages").insertOne({
      from: user,
      to: to,
      text: text,
      type: type,
      time: dayjs().format("HH:mm:ss"),
    });
    res.sendStatus(201);
  } catch (error) {
    res.sendStatus(500);
  }
});

function filterPrivateMessage(message, user) {
  if (!(message.type === "private_message") || message.to === "Todos") {
    return true;
  }

  return message.from === user || message.to === user;
}

app.get("/messages", async (req, res) => {
  const limit = parseInt(req.query.limit);
  const { user } = req.headers;

  try {
    const response = await db.collection("messages").find().toArray();
    const filteredMessages = response
      .splice(-limit)
      .filter((message) => filterPrivateMessage(message, user));
    res.send(filteredMessages);
  } catch (error) {
    res.sendStatus(500);
  }
});

app.post("/status", async (req, res) => {
  const participantsValid = await db;
  const { user } = req.headers
    .collection("participants")
    .findOne({ name: user });

  if (!participantsValid) {
    res.sendStatus(404);
    return;
  }

  try {
    await db
      .collection("participants")
      .updateOne({ name: user }, { $set: { lastStatus: Date.now() } });

    res.sendStatus(200);
  } catch (error) {
    res.sendStatus(500);
  }
});

async function removeInactive() {
  const allUsers = await db.collection("participants").find().toArray();

  await allUsers.forEach((user, index) => {
    if ((Date.now() - user.lastStatus) / 1000 >= 15) {
      db.collection("participants").deleteOne({ name: user.name });
      db.collection("messages").insertOne({
        from: user.name,
        to: "Todos",
        text: "Sai da sala...",
        type: "status",
        time: dayjs().format("HH:mm:ss"),
      });
    }
  });
}
setInterval(removeInactive, 15000);

app.delete("/messages/:idMessage", async (req, res) => {
  const { idMessage } = req.params;
  const { user } = req.headers;
  try {
    const participantMessage = await db.collection("messages").findOne({
      from: user,
      _id: ObjectId(idMessage),
    });

    const messageValid = await db.collection("messages").findOne({
      _id: ObjectId(idMessage),
    });

    if (!messageValid) {
      res.sendStatus(404);
      return;
    }

    if (participantMessage && participantMessage.type !== "status") {
      await db.collection("messages").deleteOne({ _id: ObjectId(idMessage) });
      res.sendStatus(200);
      return;
    } else {
      res.sendStatus(401);
      return;
    }
  } catch (error) {
    res.sendStatus(500);
  }
});

app.listen(5000, () => console.log("Listening on port 5000"));
