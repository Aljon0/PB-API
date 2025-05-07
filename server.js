import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import logger from './middleware/logger.js';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enhanced CORS configuration
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'https://pb-api-phle.onrender.com', 'https://projectbaymax.onrender.com'], 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(logger);
// Environment variables
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

// Simple health check endpoint to verify the server is running
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Mistral AI endpoint
app.post('/api/mistral', async (req, res) => {
  try {
    const { prompt, medicalContext } = req.body;
    
    // Construct the full prompt for Mistral
    const fullPrompt = `
You are Baymax, a compassionate healthcare companion robot designed to provide medical information and assistance.
Your responses should be helpful, informative, and caring, but clearly indicate that you are not a substitute for professional medical care.

USE THIS MEDICAL CONTEXT IN YOUR RESPONSE (but don't reference it directly):
${medicalContext}

USER QUERY:
${prompt}

Instructions for your response:
1. Analyze the symptoms carefully
2. Provide possible causes based on the medical information available
3. Suggest basic home care remedies when appropriate
4. Use bullet points for any lists of recommendations
5. Include a clear disclaimer about consulting healthcare professionals
6. Be compassionate and reassuring, like Baymax from Big Hero 6
7. Keep your response concise and easy to understand
`;

    const response = await axios.post(
      'https://api.mistral.ai/v1/chat/completions',
      {
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: fullPrompt }],
        temperature: 0.7,
        max_tokens: 800
      },
      {
        headers: {
          'Authorization': `Bearer ${MISTRAL_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Extract the assistant's response
    const answer = response.data.choices[0].message.content;
    res.json({ answer });
  } catch (error) {
    console.error('Mistral API error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error processing your request' });
  }
});

// MedlinePlus API endpoint
app.get('/api/medlineplus', async (req, res) => {
  try {
    const { query } = req.query;
    
    // Using the MedlinePlus Connect Web Service
    const response = await axios.get(
      `https://connect.medlineplus.gov/service?mainSearchCriteria.v.cs=2.16.840.1.113883.6.103&mainSearchCriteria.v.c=${encodeURIComponent(query)}&knowledgeResponseType=application/json`
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('MedlinePlus API error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error fetching from MedlinePlus' });
  }
});

// National Library of Medicine (NLM) API
app.get('/api/nlm', async (req, res) => {
  try {
    const { query } = req.query;
    
    // Using the PubMed API through E-utilities
    const searchResponse = await axios.get(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retmax=3`
    );
    
    const idList = searchResponse.data.esearchresult.idlist;
    
    if (!idList || idList.length === 0) {
      return res.json({ message: 'No medical literature found' });
    }
    
    // Get summary for the first few articles
    const summaryResponse = await axios.get(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${idList.join(',')}&retmode=json`
    );
    
    res.json(summaryResponse.data);
  } catch (error) {
    console.error('NLM API error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error fetching from National Library of Medicine' });
  }
});

// Add the missing /api/symptoms endpoint
app.post('/api/symptoms', async (req, res) => {
  try {
    const { symptoms } = req.body;
    
    // Log the request to help debug
    console.log("Received symptoms analysis request:", symptoms);
    
    // This is a simplified symptom analyzer - in a real app you'd want a more robust solution
    // or integration with a medical API
    const commonConditions = {
      "headache": ["Tension headache", "Migraine", "Dehydration", "Stress"],
      "fever": ["Common cold", "Flu", "Infection", "COVID-19"],
      "cough": ["Common cold", "Bronchitis", "Asthma", "COVID-19"],
      "sore throat": ["Pharyngitis", "Common cold", "Strep throat", "Tonsillitis"],
      "fatigue": ["Lack of sleep", "Anemia", "Depression", "Chronic fatigue syndrome"],
      "nausea": ["Food poisoning", "Motion sickness", "Migraine", "Pregnancy"],
      "dizziness": ["Inner ear issues", "Low blood pressure", "Anemia", "Anxiety"],
      "rash": ["Allergic reaction", "Eczema", "Contact dermatitis", "Psoriasis"],
      "pain": ["Injury", "Inflammation", "Muscle strain", "Nerve issues"]
    };
    
    const analysis = {
      possibleConditions: [],
      severity: "mild", // Default
      needsMedicalAttention: false
    };
    
    // Simple keyword matching
    const symptomText = symptoms.toLowerCase();
    let severityIndicators = 0;
    
    Object.keys(commonConditions).forEach(symptom => {
      if (symptomText.includes(symptom)) {
        analysis.possibleConditions = [
          ...analysis.possibleConditions,
          ...commonConditions[symptom]
        ];
        severityIndicators++;
      }
    });
    
    // Check for severe symptoms
    const severeSymptoms = [
      "can't breathe", "difficulty breathing", "chest pain", "severe pain",
      "unconscious", "unresponsive", "seizure", "stroke", "heart attack",
      "blood loss", "bleeding heavily", "can't move", "paralysis"
    ];
    
    severeSymptoms.forEach(symptom => {
      if (symptomText.includes(symptom)) {
        analysis.severity = "severe";
        analysis.needsMedicalAttention = true;
      }
    });
    
    // Moderate severity based on multiple symptoms
    if (severityIndicators > 2 && analysis.severity !== "severe") {
      analysis.severity = "moderate";
    }
    
    // Remove duplicates from possible conditions
    analysis.possibleConditions = [...new Set(analysis.possibleConditions)];
    
    console.log("Sending analysis response:", analysis);
    res.json(analysis);
  } catch (error) {
    console.error('Symptom analysis error:', error);
    res.status(500).json({ error: 'Error analyzing symptoms' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API accessible at http://localhost:${PORT}/api/health`);
});