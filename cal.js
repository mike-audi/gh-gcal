var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');
var GitHubApi = require("github");
var config = require('./config.js');

var SCOPES = ['https://www.googleapis.com/auth/calendar'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE)+ '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'calendar-nodejs-quickstart.json';

var github = new GitHubApi({
	version: "3.0.0",
	protocol: "https",
	host: "api.github.com",
	//debug: true,
	timeout: 5000,
	headers: {
		"user-agent": "IssueTestApp"
	}
});

// Load client secrets from a local file
fs.readFile('client_secret.json',function processClientSecrets(err, content){
	if(err){
		console.log('Error loading client secret file: ' + err);
		return;
	}
	// Authorize a client with the loaded credentials, then call the Google Calendar API.
	authorize(JSON.parse(content), updateMilestones);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the given callback function
 *
 * @param {Object} credentials the authorization client credentials.
 * @param {function} callback the call with the authroized client.
 */
function authorize(credentials, callback){
	var clientSecret = credentials.installed.client_secret;
	var clientId = credentials.installed.client_id;
	var redirectUrl = credentials.installed.redirect_uris[0];
	var auth = new googleAuth();
	var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

	// Check if we have previously stored a token.
	fs.readFile(TOKEN_PATH, function(err, token) {
		if(err){
			getNewToken(oauth2Client, callback);
		}else{
			oauth2Client.credentials = JSON.parse(token);
			callback(oauth2Client);
		}
	});
}

/**
 * Get and store new token after prompting for user authorizatio, and then execute the given callback with the authorized Oauth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized client.
 */
function getNewToken(oauth2Client, callback){
	var authUrl = oauth2Client.generateAuthUrl({
		access_type: 'offline',
		scope: SCOPES
	});
	console.log('Authorize this app by visiting this url: ', authUrl);
	var rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});
	rl.question('Enter the code from that page here: ',function(code){
		rl.close();
		oauth2Client.getToken(code, function(err, token){
			if(err){
				console.log('Error while trying to retrieve access token', err);
				return;
			}
			oauth2Client.credentials = token;
			storeToken(token);
			callback(oauth2Client);
		});
	});
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token){
	try{
		fs.mkdirSync(TOKEN_DIR);
	}catch(err){
		if(err.code != 'EEXIST'){
			throw err;
		}
	}
	fs.writeFile(TOKEN_PATH, JSON.stringify(token));
	console.log('Token stored to ' + TOKEN_PATH);
}

function makeEvent(stone,auth){
	var calendar = google.calendar('v3');
	var dstart = new Date(stone.due_on);
	dstart.setUTCHours(4);
	var dend = new Date(dstart);
	dend.setDate(dend.getDate()+1);
	console.log('Making Event: ' + stone.title);
	calendar.events.insert({
		auth: auth,
		calendarId: config.cal,
		resource: {
			source: {"url":stone.url},
			end: {"date": dend.toJSON().slice(0,10)},
			start: {"date": dstart.toJSON().slice(0,10)},
			description: stone.description,
			summary: stone.title,
			location: stone.html_url
		}
	}, function(err, response){
		if(err){
			console.log('Couldnt Make ' + JSON.stringify(stone) +  err);
			return;
		}
		//console.log(response);
	});
}

function updateMilestones(auth){
	var tokenfile = "a";
	fs.readFile('token.txt','utf-8',function(err,data){
	if(err){
		console.log('Could not read token.txt');
	}else{
		tokenfile = data;
		github.authenticate({
			type: "oauth",
			token: tokenfile.slice(0,tokenfile.length-1)
		});
		
		github.repos.getAll({},function(err,res){
		if(err){
			console.log('Problem getting repos :' + err);
		}else{
		for(var i=0; i<res.length; i++){
		if(res[i].owner.login == config.user){
			github.issues.getAllMilestones({
				user : config.user,
				repo : res[i].name
			},function(err,stones){
			if(err){
				console.log("Error getting milestones: " + err);
			}else{
				for(var i=0; i<stones.length; i++){
					getEvents(stones[i],auth,function(pass,evn,stone){
						if(pass){
							updateEvent(stone,evn,auth);
						}else{
							makeEvent(stone,auth);
						}
					});
				}
			}});
		}}}});
	}});
}

function getEvents(stone, auth, callback){
	var calendar = google.calendar('v3');
	calendar.events.list({
		auth: auth,
		calendarId: config.cal
	},function(err,list){
		if(err){
			console.log("Get error: " + err);
		}else{
			for(var j=0; j<list.items.length; j++){
				if(list.items[j].source.url == stone.url){
					callback(true,list.items[j],stone);
					return;
				}
			}
			callback(false,null,stone);
			return;
		}
	});
}

function updateEvent(stone, env, auth){
	var calendar = google.calendar('v3');
	var dstart = new Date(stone.due_on);
	dstart.setUTCHours(4);
	var dend = new Date(dstart);
	dend.setDate(dend.getDate()+1);

	if((dstart.toJSON().slice(0,10) == env.start.date) &&
	   (env.description == stone.description) &&
	   (env.summary == stone.title) &&
	   (env.location == stone.html_url)){
		console.log('No change to: ' + stone.title);
	}else{
		console.log('Updating: ' + stone.title);
		calendar.events.update({
			auth: auth,
			calendarId: config.cal,
			eventId: env.id,
			resource:{
				source: {"url":stone.url},
				description: stone.description,
				summary: stone.title,
				start:{"date":dstart.toJSON().slice(0,10)},
				end:{"date":dend.toJSON().slice(0,10)},
				location:stone.html_url
			}
		},function(err,res){
			if(err){
				console.log("update error: " + err);
			}
		});
	}
}	
