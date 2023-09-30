const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const OpenAI = require('openai').default;


const app = express();

require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI
const SERVER_URL = process.env.SERVER_URL;
const SERVER_PORT = process.env.SERVER_PORT;


const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI(OPENAI_API_KEY);


mongoose.set('debug', true);

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function () {
    console.log('Connected to MongoDB');
    console.log('Connected to Database:', db.name);
});

const symptomSchema = new mongoose.Schema({
    zip: String,
    symptoms: {
        type: Object,
        required: true
    }
});
const Symptom = mongoose.model('Symptom', symptomSchema, 'zips');

app.use(cors());
app.use(express.json());

app.get('/symptoms/:zip', async (req, res) => {
    try {
        console.log('Database Connection State:', db.readyState);

        const zip = req.params.zip;
        console.log('Requested ZIP:', zip);

        const symptoms = await Symptom.findOne({ zip: zip });
        console.log('Database Result:', symptoms);

        if (symptoms) {
            res.json(symptoms);
        } else {
            res.status(404).json({ message: "Not found" });
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ message: error.message });
    }
});


app.post('/analyze', async (req, res) => {
    const { summary } = req.body;

    try {
        const completion = await openai.ChatCompletion.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "You are a helpful assistant." },
                { role: "user", content: summary }
            ]
        });
        
        const insight = completion.choices[0].message.content.trim();
        res.json({ insight });
    } catch (error) {
        console.error("Error querying OpenAI:", error);
        res.status(500).json({ message: error.message });
    }
});


async function getOutbreakAnalysis(zip, symptoms) {
    const symptomSummary = Object.entries(symptoms)
                                 .map(([symptom, count]) => `${count} people have ${symptom}`)
                                 .join(', ');

    const summary = `In my simulation video game, there is an area where ${symptomSummary}. Based on the symptoms of the population in my video game, what real life disease do you think would be prevalent in my video game simulation?`;

    const conversation = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: summary }
    ];
    
    const result = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: conversation
    });
    
    return result.choices[0].message.content;
}




app.get('/analyze/:zip', async (req, res) => {
    try {
        const zip = req.params.zip;
        const symptoms = await Symptom.findOne({ zip: zip });

        if (!symptoms) {
            return res.status(404).json({ message: "ZIP not found" });
        }

        const analysis = await getOutbreakAnalysis(zip, symptoms.symptoms);
        res.json({ analysis });

    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ message: error.message });
    }
});

app.listen(SERVER_PORT, () => {
    console.log(`Server started on ${SERVER_URL}/${SERVER_PORT}`);
});
