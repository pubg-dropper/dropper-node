var Discord = require('discord.io');
var logger = require('winston');
var Dropper = require('dropper.js');

// Configure logger settings
logger.remove(logger.transports.Console);

logger.add(logger.transports.Console, {
    colorize: true
});
logger.level = process.env.DEBUG ? 'debug' : 'error';

// Initialize Discord Bot
var bot = new Discord.Client({
    token: process.env.AUTH,
    autorun: true
});

dropper = new Dropper(bot);

// As soon as we're connected
bot.on('ready', function (evt) {
    logger.info('Client initialized - booting.');
});

// Parse messages
bot.on('message', dropper.handleMessage);


