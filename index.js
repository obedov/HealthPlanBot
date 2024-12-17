require('dotenv').config();
const connectToDatabase = require('./db');
const TelegramBot = require('node-telegram-bot-api');
const { OpenAI } = require('openai');

const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const openAIClient = new OpenAI({ apiKey: OPENAI_API_KEY });

const userSessions = {};

async function initializeDatabaseConnection() {
    try {
        const dbConnection = await connectToDatabase();
        return dbConnection.collection('conversations');
    } catch (error) {
        console.error('Error connecting to database:', error.message);
        process.exit(1);
    }
}

function resetUserSession(chatId) {
    userSessions[chatId] = { step: 0, responses: {} };
}

async function fetchHealthPlanRecommendation(familySize, income, gender) {
    const prompt = `User requires a detailed and structured health insurance plan recommendation.
        Family size: ${familySize}
        Household income (USD per month): ${income}
        Gender: ${gender}
        
        Provide a response that includes:
        1. A clear title: "Health Insurance Plan Recommendation:"
        2. A **step-by-step list** with up to 10 actionable bullet points. Use bold headings for each point, followed by a brief, concise explanation.
        3. A concluding paragraph summarizing the importance of selecting the right plan based on the user's details.

        Ensure the response is **well-formatted**, **complete**, and fits within 500 tokens.
        Strictly avoid using symbols like # or creating unstructured paragraphs.
        Each bullet point must stand out clearly.`;

    try {
        const response = await openAIClient.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'You are a helpful assistant providing concise recommendations.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 500,
            temperature: 0.4,
        });
        return response.choices[0].message.content.trim();
    } catch (error) {
        console.error('Error fetching recommendation from OpenAI:', error.message);
        return 'Sorry, I encountered an issue while generating health insurance plan recommendation. Please try again later.';
    }
}

(async function startBot() {
    const conversationCollection = await initializeDatabaseConnection();

    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const username = msg.from.first_name || 'User';
        resetUserSession(chatId);
        await bot.sendMessage(chatId, `Welcome, ${username}! Are you looking for a health insurance plan? (yes/no)`);
        userSessions[chatId].step = 1;
    });

    bot.onText(/\/help/, async (msg) => {
        const helpMessage = `Commands:
            /start - Start a new conversation
            /help - Show available commands
            /cancel - Cancel the current conversation.`;
        await bot.sendMessage(msg.chat.id, helpMessage);
    });

    bot.onText(/\/cancel/, async (msg) => {
        resetUserSession(msg.chat.id);
        await bot.sendMessage(msg.chat.id, 'Conversation canceled. Start again with /start.');
    });

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const userMessage = msg.text.trim().toLowerCase();

        if (userMessage.startsWith('/')) return;
        if (!userSessions[chatId]) {
            await bot.sendMessage(chatId, 'Please start with /start.');
            return;
        }

        const session = userSessions[chatId];
        try {
            switch (session.step) {
                case 1:
                    if (["yes", "y"].includes(userMessage)) {
                        await bot.sendMessage(chatId, 'Great! What is your family size?');
                        session.step = 2;
                    } else if (["no", "n"].includes(userMessage)) {
                        await bot.sendMessage(chatId, 'No problem! See you next time.');
                        resetUserSession(chatId);
                    } else {
                        await bot.sendMessage(chatId, 'Please answer with yes or no.');
                    }
                    break;

                case 2:
                    const familySize = parseInt(userMessage, 10);
                    if (isNaN(familySize) || familySize <= 0) {
                        await bot.sendMessage(chatId, 'Please enter a valid number for family size.');
                        return;
                    }
                    session.responses.familySize = familySize;
                    await bot.sendMessage(chatId, 'What is your household income (USD per month)?');
                    session.step = 3;
                    break;

                case 3:
                    const income = parseInt(userMessage, 10);
                    if (isNaN(income) || income <= 0) {
                        await bot.sendMessage(chatId, 'Please enter a valid income amount.');
                        return;
                    }
                    session.responses.income = income;
                    await bot.sendMessage(chatId, 'What is your gender? (male/female/other)');
                    session.step = 4;
                    break;

                case 4:
                    if (!['male', 'female', 'other'].includes(userMessage)) {
                        await bot.sendMessage(chatId, 'Please specify your gender as male, female, or other.');
                        return;
                    }
                    session.responses.gender = userMessage;

                    await bot.sendMessage(chatId, 'Generating your health insurance plan recommendation...\nPlease wait.');

                    const { familySize: size, income: monthlyIncome, gender } = session.responses;
                    const recommendation = await fetchHealthPlanRecommendation(size, monthlyIncome, gender);

                    await bot.sendMessage(chatId, recommendation, { parse_mode: 'Markdown' });

                    await conversationCollection.insertOne({
                        chatId,
                        timestamp: new Date(),
                        responses: session.responses,
                        recommendation,
                    });

                    await bot.sendMessage(chatId, 'Thank you! Have a great day!');
                    resetUserSession(chatId);
                    break;

                default:
                    await bot.sendMessage(chatId, 'Please start a conversation using /start.');
                    break;
            }
        } catch (error) {
            console.error('Error processing user message:', error.message);
            await bot.sendMessage(chatId, 'Something went wrong. Please try again later.');
            resetUserSession(chatId);
        }
    });

    console.log('Health Insurance Plan Bot is running...');
})();
