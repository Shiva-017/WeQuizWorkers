import { getDistance } from 'geolib';

const userLocations = {};

async function parseJson(request) {
    try {
        return await request.json();
    } catch (error) {
        throw new Error('Invalid JSON payload');
    }
}

// Helper to create consistent responses
function createResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

async function handleRequest(request) {
    const url = new URL(request.url);
    // To track location
    if (url.pathname === '/track-user-location' && request.method === 'POST') {
        try {
            const { userId, latitude, longitude } = await parseJson(request);
            const timestamp = new Date();

            if (!userLocations[userId]) {
                userLocations[userId] = { lastLocation: { latitude, longitude }, timestamp };
                return createResponse({ message: 'User location initialized.' });
            }

            const { lastLocation, timestamp: lastTimestamp } = userLocations[userId];
            const distance = getDistance(lastLocation, { latitude, longitude });

            if (distance < 50) {
                const duration = (timestamp - new Date(lastTimestamp)) / 1000 / 60; // Duration in minutes
                if (duration >= 10) {
                    return createResponse({ message: 'Trigger quiz', location: { latitude, longitude } });
                }
            }

            // Updating the location
            userLocations[userId] = { lastLocation: { latitude, longitude }, timestamp };
            return createResponse({ message: 'Location updated.' });
        } catch (error) {
            return createResponse({ error: 'Failed to track user location', details: error.message }, 500);
        }
    }

    // To Generate quiz
    if (url.pathname === '/generate-quiz' && request.method === 'POST') {
        try {
            const { locationKeyword } = await parseJson(request);

            const response = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer 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`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'llama-3.1-sonar-small-128k-online',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a quiz generator. Create a precise multiple-choice quiz.',
                        },
                        {
                            role: 'user',
                            content: `Generate a 5-question multiple-choice quiz about ${locationKeyword}. 
                            Format EXACTLY like this:
                            1. What is [question]?
                                a) [Option A]
                                b) [Option B]
                                c) [Option C]
                                d) [Option D]
                            Answer: [Correct Answer]`,
                        },
                    ],
                    max_tokens: 500,
                    temperature: 0.7,
                }),
            });

            if (!response.ok) {
                throw new Error(`API call failed with status ${response.status}`);
            }

            const data = await response.json();
            const quizText = data.choices[0].message.content;
            const quizQuestions = parseQuiz(quizText);

            return createResponse({ questions: quizQuestions, rawText: quizText });
        } catch (error) {
            return createResponse({ error: 'Quiz generation failed', details: error.message }, 500);
        }
    }

    return createResponse({ error: 'Not Found' }, 404);
}

// Parse quiz from API response
function parseQuiz(quizText) {
    const questions = [];
    const questionRegex = /(\d+\.\s*[^\n]+)\n\s*a\)\s*([^\n]+)\n\s*b\)\s*([^\n]+)\n\s*c\)\s*([^\n]+)\n\s*d\)\s*([^\n]+)\n\s*Answer:\s*([^\n]+)/g;

    let match;
    while ((match = questionRegex.exec(quizText)) !== null) {
        questions.push({
            question: match[1].trim(),
            options: {
                a: match[2].trim(),
                b: match[3].trim(),
                c: match[4].trim(),
                d: match[5].trim(),
            },
            answer: match[6].trim(),
        });
    }

    return questions;
}

addEventListener('fetch', (event) => {
    event.respondWith(
        (async () => {
            try {
                return await handleRequest(event.request);
            } catch (error) {
                return createResponse({ error: 'Internal Server Error', details: error.message }, 500);
            }
        })()
    );
});
