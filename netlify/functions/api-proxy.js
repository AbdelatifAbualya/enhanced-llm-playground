// Netlify Function to securely proxy requests to Fireworks.ai
// Place this file in netlify/functions/api-proxy.js

const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'POST'
      }
    };
  }

  try {
    // Get API key from environment variable
    const API_KEY = process.env.FIREWORKS_API_KEY;
    
    if (!API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'API key not configured' }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    // Parse the request body
    const requestBody = JSON.parse(event.body);
    
    // Forward the request to Fireworks.ai
    const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    // Get the response data
    const data = await response.json();

    // Return the response from Fireworks.ai
    return {
      statusCode: response.status,
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json'
      }
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error', message: error.message }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
};
