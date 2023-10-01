const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const OpenAI = require("openai").default;
const utils = require("./utils.js");
const bcrypt = require("bcrypt");
const fs = require("fs");
const csv = require("csv-parser");
const app = express();

require("dotenv").config();

const MONGODB_URI = process.env.MONGODB_URI;
const SERVER_URL = process.env.SERVER_URL;
const SERVER_PORT = process.env.SERVER_PORT;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI(OPENAI_API_KEY);

mongoose.set("debug", true);

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", function () {
  console.log("Connected to MongoDB");
  console.log("Connected to Database:", db.name);
});

const symptomSchema = new mongoose.Schema({
  zip: String,
  entries: [
    new mongoose.Schema({
      day: Number,
      symptoms: {
        type: Object,
        required: true,
      },
    }),
  ],
  population: Number,
});

const Symptom = mongoose.model("Symptom", symptomSchema, "zips");

const symptoms = [
  "fever",
  "fatigue",
  "cough",
  "shortnessOfBreath",
  "soreThroat",
  "runnyNose",
  "bodyAches",
  "headache",
  "chills",
  "nausea",
  "diarrhea",
  "lossOfAppetite",
  "sweating",
  "jointPain",
  "swollenLymphNodes",
  "rash",
  "abdominalPain",
  "dizziness",
  "lossOfTasteOrSmell",
  "chestPain",
];

app.use(cors());
app.use(express.json());

app.get("/symptoms/:zip", async (req, res) => {
  try {
    console.log("Database Connection State:", db.readyState);

    const zip = req.params.zip;
    console.log("Requested ZIP:", zip);

    const symptoms = await Symptom.findOne({ zip: zip });
    console.log("Database Result:", symptoms);

    if (symptoms) {
      res.json(symptoms);
    } else {
      res.status(404).json({ message: "Not found" });
    }
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ message: error.message });
  }
});

app.post("/analyze", async (req, res) => {
  const { summary } = req.body;

  try {
    const completion = await openai.ChatCompletion.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: summary },
      ],
    });

    const insight = completion.choices[0].message.content.trim();
    res.json({ insight });
  } catch (error) {
    console.error("Error querying OpenAI:", error);
    res.status(500).json({ message: error.message });
  }
});

async function getOutbreakAnalysis(
  zip,
  zipRow,
  population,
  symptoms,
  symptomsCount
) {
  const symptomSummary = Object.entries(symptoms)
    .map(
      ([symptom, count]) =>
        `${count} out of ${population} people have ${symptom}`
    )
    .join(", ");
  console.log("COUNT", symptomsCount);
  const summary = `In my simulation video game, there is an area with a population of ${population} where ${symptomSummary} and details about the zipcode in area are: ${zipRow}. 
  Based on these symptoms, what real-life disease might be prevalent in my video game simulation?
  Note that there can be no significant disease prevalent If the number of symptoms is not significant enough compared to the population, you should return 'None'

  provide this information as a json similar to this:
  {
  "possibleDiseases": ["common cold": {severitylevel}, "influenza":{severitylevel}] // each disease in possibleDiseases should have a low, mild, moderate, severe, critical based on the given information 
and if there are no potential diseases use ["none"]
  "safetyGuidelines":["{3 sentence safety guideline for disease such as common cold"},"{same for rest of possibleDiseases}"]
  "percentageReported": {population / ${symptomsCount}}
  // also create fields for possible amount infected with listed possible Diseases. MAKE SURE each possibleDiseases exists as a key in this field
  // also create a field that describes population density
  // create fields for each symptom with count ex: "headache": int
  // also include zipCode: {zipCode}
  // also include population: {population}
  // and create an age distribution, vaccination Status, and comorbidities fields in this exact format
  heres an example JSON. make sure to follow this EXACT FORMAT. every string in possibleDisease needs to correspond to each key in the amountInfected field
  {
    "possibleDiseases": ["common cold", "influenza"],
    "safetyGuidelines": [
      "Wash your hands frequently and avoid touching your face.",
      "Cover your mouth and nose with a tissue or your elbow when coughing or sneezing.",
      "Stay home if you are feeling sick and seek medical attention if necessary."
    ],
    "amountInfected"["common cold": 14, "influenza": 53],
    "percentageReported": 0.116,
    "common cold": 1014,
    "influenza": 966,
    "headache": 1298,
    "fever": 1604,
    "fatigue": 1824,
    "cough": 1449,
    "shortnessOfBreath": 1754,
    "soreThroat": 966,
    "runnyNose": 1014,
    "bodyAches": 1261,
    "chills": 1241,
    "nausea": 1395,
    "diarrhea": 1607,
    "lossOfAppetite": 1405,
    "sweating": 1482,
    "jointPain": 1282,
    "swollenLymphNodes": 1325,
    "rash": 1463,
    "abdominalPain": 1420,
    "dizziness": 1326,
    "lossOfTasteOrSmell": 2367,
    "chestPain": 1396,
    "zipCode": "91344",
    "population": 52450,
    "ageDistribution": {
      "0-18": 5487,
      "19-35": 9765,
      "36-60": 16542,
      "61+": 2894
    },
    "vaccinationStatus": {
      "fullyVaccinated": 16234,
      "partiallyVaccinated": 12456,
      "notVaccinated": 10032
    },
    "comorbidities": {
      "diabetes": 2654,
      "hypertension": 4762,
      "respiratoryConditions": 2375
    }
  }
  `;
  //console.log("prompt", summary);
  const conversation = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: summary },
  ];

  const result = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: conversation,
  });

  return result.choices[0].message.content;
}

function getDataByZipcode(zip) {
  return new Promise((resolve, reject) => {
    let matchedRow = null;
    let headers = null;
    fs.createReadStream("California_Zip_Codes.csv")
      .pipe(csv())
      .on("data", (row) => {
        if (!headers) {
          headers = Object.keys(row);
        }
        if (row.ZIP_CODE === zip) {
          matchedRow = row;
        }
      })
      .on("end", () => {
        if (matchedRow) {
          const rowData = headers
            .map((header) => `${header} = ${matchedRow[header]}`)
            .join(", ");
          resolve(rowData);
        } else {
          reject(new Error(`No data found for ZIP code '${zip}'`));
        }
      });
  });
}

app.get("/analyze/:zip", async (req, res) => {
  try {
    const zip = req.params.zip;
    const data = await Symptom.findOne({ zip: zip });
    let zipRow = "";
    if (!data) {
      return res.status(404).json({ message: "ZIP not found" });
    }

    if (!data.population) {
      return res
        .status(400)
        .json({ message: "Population data missing for this ZIP" });
    }

    zipRow = await getDataByZipcode(zip);
    const { symptomsSum, count } = utils.getSymptomsData(data.entries, 14);
    const analysis = await getOutbreakAnalysis(
      zip,
      zipRow,
      data.population,
      symptomsSum,
      count
    );
    res.json({ analysis });
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ message: error.message });
  }
});

app.post("/postSymptoms", async (req, res) => {
  const data = req.body;
  let zipcode = data["zipCode"];

  const query = await Symptom.findOne({ zip: zipcode });

  if (query == null) {
    return res.status(500).json({ message: "invalid zip code" });
  }

  const currentDate = new Date();
  const currentTime = currentDate.getTime();
  const day = Math.floor(currentTime / (1000 * 60 * 60 * 24));

  let entries = query["entries"];
  console.log(entries);
  if (entries[entries.length - 1]["day"] == day) {
    symptoms.forEach((item, index) => {
      entries[entries.length - 1]["symptoms"][item] += data[item];
    });
  } else {
    let newSymptoms = {};
    symptoms.forEach((item, index) => {
      newSymptoms[item] = data[item];
    });
    entries.push({
      day: day,
      symptoms: newSymptoms,
    });
  }

  console.log(entries);

  try {
    await Symptom.findOneAndUpdate(
      { zip: zipcode },
      {
        entries: entries,
      },
      { upsert: true }
    );
    console.log(`Processed ZIP: ${zipcode}`);
    return res.status(200).json({ message: "success" });
  } catch (error) {
    console.error(`Error processing ZIP: ${zipcode}`, error);
    return res.status(500).json({ message: "failed upload" });
  }
});

const userSchema = new mongoose.Schema({
  username: String,
  email: {
    type: String,
    unique: true,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
});

const User = mongoose.model("User", userSchema, "users");

// Registration endpoint
app.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User with this email already exists!" });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = new User({
      username,
      email,
      password: hashedPassword,
    });

    await newUser.save();
    res.status(201).json({ message: "User registered successfully!" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Login endpoint

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "User not found!" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (match) {
      res.json({ message: "Login successful!" });
    } else {
      res.status(401).json({ message: "Invalid password!" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

const PORT = process.env.SERVER_PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
