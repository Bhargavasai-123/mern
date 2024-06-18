const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = 5000;
const MONGODB_URI = 'mongodb://localhost:27017/transactions_db';

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB');
});

// Define the schema and model
const transactionSchema = new mongoose.Schema({
    id: String,
    title: String,
    description: String,
    price: Number,
    dateOfSale: Date,
    category: String,
    sold: Boolean,
});

const Transaction = mongoose.model('Transaction', transactionSchema);

// API to fetch and initialize the database
app.get('/api/init', async (req, res) => {
    try {
        const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
        await Transaction.deleteMany({});
        await Transaction.insertMany(response.data);
        res.status(200).send('Database initialized with seed data');
    } catch (error) {
        res.status(500).send('Error initializing database');
    }
});

// API to list all transactions with search and pagination
app.get('/api/transactions', async (req, res) => {
    const { search = '', page = 1, perPage = 10, month } = req.query;
    const query = {
        dateOfSale: { $regex: `-${String(new Date(Date.parse(month +" 1, 2020")).getMonth()+1).padStart(2, '0')}-`, $options: 'i' }
    };

    if (search) {
        query.$or = [
            { title: new RegExp(search, 'i') },
            { description: new RegExp(search, 'i') },
            { price: new RegExp(search, 'i') },
        ];
    }

    try {
        const transactions = await Transaction.find(query)
            .skip((page - 1) * perPage)
            .limit(parseInt(perPage));
        const totalTransactions = await Transaction.countDocuments(query);
        res.json({
            transactions,
            totalTransactions,
            totalPages: Math.ceil(totalTransactions / perPage),
        });
    } catch (error) {
        res.status(500).send('Error fetching transactions');
    }
});

// API for transaction statistics
app.get('/api/statistics', async (req, res) => {
    const { month } = req.query;
    const monthRegex = new RegExp(`-${String(new Date(Date.parse(month +" 1, 2020")).getMonth()+1).padStart(2, '0')}-`, 'i');

    try {
        const transactions = await Transaction.find({ dateOfSale: { $regex: monthRegex } });
        const totalSales = transactions.reduce((acc, t) => acc + (t.sold ? t.price : 0), 0);
        const totalSoldItems = transactions.filter(t => t.sold).length;
        const totalNotSoldItems = transactions.length - totalSoldItems;

        res.json({
            totalSales,
            totalSoldItems,
            totalNotSoldItems,
        });
    } catch (error) {
        res.status(500).send('Error fetching statistics');
    }
});

// API for bar chart data
app.get('/api/bar-chart', async (req, res) => {
    const { month } = req.query;
    const monthRegex = new RegExp(`-${String(new Date(Date.parse(month +" 1, 2020")).getMonth()+1).padStart(2, '0')}-`, 'i');

    const ranges = [
        { range: '0-100', min: 0, max: 100 },
        { range: '101-200', min: 101, max: 200 },
        { range: '201-300', min: 201, max: 300 },
        { range: '301-400', min: 301, max: 400 },
        { range: '401-500', min: 401, max: 500 },
        { range: '501-600', min: 501, max: 600 },
        { range: '601-700', min: 601, max: 700 },
        { range: '701-800', min: 701, max: 800 },
        { range: '801-900', min: 801, max: 900 },
        { range: '901-above', min: 901, max: Infinity },
    ];

    try {
        const transactions = await Transaction.find({ dateOfSale: { $regex: monthRegex } });
        const barChartData = ranges.map(range => {
            const count = transactions.filter(t => t.price >= range.min && t.price <= range.max).length;
            return { range: range.range, count };
        });

        res.json(barChartData);
    } catch (error) {
        res.status(500).send('Error fetching bar chart data');
    }
});

// API for pie chart data
app.get('/api/pie-chart', async (req, res) => {
    const { month } = req.query;
    const monthRegex = new RegExp(`-${String(new Date(Date.parse(month +" 1, 2020")).getMonth()+1).padStart(2, '0')}-`, 'i');

    try {
        const transactions = await Transaction.find({ dateOfSale: { $regex: monthRegex } });
        const categories = [...new Set(transactions.map(t => t.category))];
        const pieChartData = categories.map(category => {
            const count = transactions.filter(t => t.category === category).length;
            return { category, count };
        });

        res.json(pieChartData);
    } catch (error) {
        res.status(500).send('Error fetching pie chart data');
    }
});

// API to combine responses
app.get('/api/combined', async (req, res) => {
    const { month } = req.query;

    try {
        const transactionsResponse = await axios.get(`http://localhost:${PORT}/api/transactions`, { params: { month } });
        const statisticsResponse = await axios.get(`http://localhost:${PORT}/api/statistics`, { params: { month } });
        const barChartResponse = await axios.get(`http://localhost:${PORT}/api/bar-chart`, { params: { month } });
        const pieChartResponse = await axios.get(`http://localhost:${PORT}/api/pie-chart`, { params: { month } });

        res.json({
            transactions: transactionsResponse.data,
            statistics: statisticsResponse.data,
            barChart: barChartResponse.data,
            pieChart: pieChartResponse.data,
        });
    } catch (error) {
        res.status(500).send('Error fetching combined data');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
