// Netlify Function to securely proxy requests to Fireworks.ai
exports.handler = async function(event, context) {
  // Set the function timeout to 120 seconds (2 minutes)
  context.callbackWaitsForEmptyEventLoop = false;
  
  // Load fetch at runtime
  const fetch = require('node-fetch');
  
  // Configure fetch timeout to 110 seconds (just under the function's 2-minute limit)
  // This uses node-fetch v2 timeout mechanism
  const fetchWithTimeout = async (url, options, timeout = 110000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      options.signal = controller.signal;
      const response = await fetch(url, options);
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  };
  
  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Allow': 'POST'
      }
    };
  }

  try {
    // Get API key from environment variable
    const API_KEY = process.env.FIREWORKS_API_KEY;
    
    if (!API_KEY) {
      console.log("ERROR: API key is missing");
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'API key not configured on server' }),
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      };
    }

    // Log request info (non-sensitive)
    console.log("Received request");
    
    try {
      // Parse the request body
      const requestBody = JSON.parse(event.body);
      console.log(`Model requested: ${requestBody.model || 'not specified'}`);
      
      // Add timing metrics for monitoring CoD vs CoT performance
      const reasoningMethod = requestBody.messages && 
                             requestBody.messages[0] && 
                             requestBody.messages[0].content &&
                             requestBody.messages[0].content.includes('Chain of Draft') ? 'CoD' : 
                             (requestBody.messages && 
                             requestBody.messages[0] && 
                             requestBody.messages[0].content &&
                             requestBody.messages[0].content.includes('Chain of Thought') ? 'CoT' : 'Standard');
      
      console.log(`Using reasoning method: ${reasoningMethod}`);
      const startTime = Date.now();
      
      // Forward the request to Fireworks.ai with timeout
      const response = await fetchWithTimeout('https://api.fireworks.ai/inference/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify(requestBody)
      }, 110000); // 110 seconds timeout

      const endTime = Date.now();
      const responseTime = endTime - startTime;
      console.log(`Fireworks API response status: ${response.status}, time: ${responseTime}ms, method: ${reasoningMethod}`);
      
      // Get the response data
      const data = await response.json();
      
      // Add performance metrics to response
      if (data && !data.error) {
        data.performance = {
          response_time_ms: responseTime,
          reasoning_method: reasoningMethod
        };
      }
      
      // Return the response from Fireworks.ai
      return {
        statusCode: response.status,
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      };
    } catch (parseError) {
      // Check if this is an abort error (timeout)
      if (parseError.name === 'AbortError') {
        console.error("Request timed out after 110 seconds");
        return {
          statusCode: 504,
          body: JSON.stringify({ 
            error: 'Gateway Timeout', 
            message: 'The request to the LLM API took too long to complete (>110 seconds)'
          }),
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        };
      }
      
      console.error("Error parsing request:", parseError);
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Bad Request', 
          message: 'Invalid request body'
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      };
    }
  } catch (error) {
    console.error('Function error:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal Server Error', 
        message: error.message
      }),
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  }
};
