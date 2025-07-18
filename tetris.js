// Classic Tetris 
// Using P5JS
// Shane Broadberry 2018

var maze;
var leftbutton, rightbutton, firebutton, thrustbutton;
var buttonImage;
var IACTImage;
var gameoverImage, bgimage, blockadeImage, defenceImages=[];
var MARGIN = 40;
var level=0;
var score=0, hiscore=0;
var lives;
var mode = 0, count=0;
var retrobg = false;
var leftmarg;
var topmarg;

var lines=0;
var GSCALE=0;
var MOBILE = false;
var DEBUG = false;   // CHANGE!! display onscreen readings 
var IMMORTAL = false; 

p5.disableFriendlyErrors = true;

var mazelayout = [], mastermaze =[], blocks=[], activeblock=[], nextblock;

var xpos=3, ypos=2;

mastermaze[00] = "#          #";
mastermaze[01] = "#          #";
mastermaze[02] = "#          #";
mastermaze[03] = "#          #";
mastermaze[04] = "#          #";
mastermaze[05] = "#          #";
mastermaze[06] = "#          #";
mastermaze[07] = "#          #";
mastermaze[08] = "#          #";
mastermaze[09] = "#          #";
mastermaze[10] = "#          #";
mastermaze[11] = "#          #";
mastermaze[12] = "#          #";
mastermaze[13] = "#          #";
mastermaze[14] = "#          #";
mastermaze[15] = "#          #";
mastermaze[16] = "#          #";
mastermaze[17] = "#          #";
mastermaze[18] = "#          #";
mastermaze[19] = "#          #";
mastermaze[20] = "############";

blocks[00] = "  1  ";
blocks[01] = "  1  ";
blocks[02] = "  1  ";
blocks[03] = "  1  ";
blocks[04] = "     ";

blocks[05] = "     ";
blocks[06] = "  2  ";
blocks[07] = " 222 ";
blocks[08] = "     ";
blocks[09] = "     ";

blocks[10] = "     ";
blocks[11] = " 33  ";
blocks[12] = "  33 ";
blocks[13] = "     ";
blocks[14] = "     ";

blocks[15] = "     ";
blocks[16] = " 4   ";
blocks[17] = " 4   ";
blocks[18] = " 44  ";
blocks[19] = "     ";

activeblock[0] = "     ";
activeblock[1] = " n   ";
activeblock[2] = " nn  ";
activeblock[3] = "     ";
activeblock[4] = "     ";

var blockcols = [0x000064, 0x00c8c8, 0xc00800,0xc8c8c8];

const BLOCKWIDTH = 5;

// Blocks are setup as 5 x 5 grids
// Draws the active block at xpos, ypos
// If SHADOW is true it will only draw outline at specified position

function drawblock(xpos=10, ypos=10, shadow=false)
{

	for ( y=0; y< BLOCKWIDTH; y++) {
		for(x=0; x< BLOCKWIDTH; x++) {
			
			var x1, y2, x2, y2
			x1 = leftmarg + (xpos + x) * blockImage.width;
			y1 = topmarg + (ypos + y) * blockImage.height;
			x2 = x1 + blockImage.width;
			y2 = y1 + blockImage.height;

			var curblock = activeblock[y][x];

			if (curblock != " ") {
				
				if(!shadow) {
					if (curblock=="1")
						fill(200,0,0,180);
					else if (curblock=="2")
						fill(0,200,200,180);
					else if (curblock=="3")
						fill(0,200,0,180);	
					else if (curblock=="4")
						fill(200,200,200,180);
					stroke(50);
					rect(x1+6+deltax, y1+6+deltay, 20, 20);
				} else {
					stroke(200,0,0);
					fill(200,200,0,70);
					rect(x1+6, y1+6, 20, 20);
				}
				
				noStroke();
				// image(blockImage, 2*marg + x * blockImage.width, marg + y * blockImage.height);
			}
		}
	}
	
}


function shownextblock(blocktype=2, xpos=15, ypos=10)
{
	var startindex = blocktype * BLOCKWIDTH;
	
	var x1, y2, x2, y2

	// Draw box for next block
	
	x1 = leftmarg + (xpos) * blockImage.width;
	y1 = topmarg + (ypos) * blockImage.height;
	
	fill(0,0,0,120);
	rect(x1-2, y1-2, 112,112);

	for ( y=0; y< BLOCKWIDTH; y++) {
		for(x=0; x< BLOCKWIDTH; x++) {
			
			x1 = leftmarg + (xpos + x) * blockImage.width;
			y1 = topmarg + (ypos + y) * blockImage.height;
			x2 = x1 + blockImage.width;
			y2 = y1 + blockImage.height;

			var curblock = blocks[startindex + y][x];
			stroke(0,0,0,190);
			if (curblock != " ") {
				
				if (curblock=="1")
					fill(200,0,0,180);
				else if (curblock=="2")
					fill(0,200,200,180);
				else if (curblock=="3")
					fill(0,200,0,180);	
				else if (curblock=="4")
					fill(200,200,200,180);	
				
				rect(x1+6, y1+6, 20, 20);
			}
		}
	}
}
// Test if active block can move to a specific at current rotation

function canmove(xpos=10, ypos=10)
{		
	var collision = false;
	
	for (y=0; y< BLOCKWIDTH; y++) {
		for(x=0; x< BLOCKWIDTH; x++) {
		
			if (activeblock[y][x] != " ") { 
				if (mazelayout[ypos+y][xpos+x]!= " ") {
					collision=true;
					return(!collision);
				}
			}
		}
	}
	return(!collision);
	
}


// Set the active block from selection of blocks

function setactiveblock(num=0)
{
	var startindex = num * BLOCKWIDTH;
	
	for(y=0;y<BLOCKWIDTH;y++) {
		activeblock[y] = blocks[startindex + y];
	}

}
// Rotate active block 90 degrees clockwise
// Rebuild the string from the rows to columns one character at a time
// Create a copy so it doesn't get corrupted on rotation

function rotateblock()
{
	var temp=[];
	for(y=0;y<BLOCKWIDTH;y++) {
		temp[y] = activeblock[y];
	}

	for(y=0;y<BLOCKWIDTH; y++) {
		activeblock[y]="";
		for(x=BLOCKWIDTH-1; x>=0;x--) {
			activeblock[y] += temp[x][y];
		}
	}
	// If rotate causes a collision reverse rotation
	if(!canmove(xpos,ypos)) {
		for(y=0;y<BLOCKWIDTH;y++) {
			activeblock[y] = temp[y] ;
		}
		
	}
	
	//activeblock[y][x] = blocks[p][x];
}

// Embed active block on screen
function embedblock(xpos, ypos)
{
	for(y=0;y<BLOCKWIDTH && (y+ypos) < mazelayout.length-1; y++) {

		 var newblock="";
		 for(x=0;x<BLOCKWIDTH && (x+xpos) < mazelayout[ypos+y].length;x++) {
			 
			 var tmp = mazelayout[ypos+y][x+xpos];
			 
			 if (tmp == undefined) {
				 console.log("Undefined y: " + ypos+y + " x: " + x+xpos);
				 tmp=" ";
			 } else {
				 if (tmp != " ") {
					 newblock+=mazelayout[ypos+y][x+xpos];
				 } else {
					 newblock+=activeblock[y][x];
				 }
			 }
		 }
		if(mazelayout[ypos+y].substr(0, xpos) == undefined) {
			console.loc("Undefined:" + xpos);
			
		}
		 mazelayout[ypos+y] = mazelayout[ypos+y].substr(0, xpos) + newblock + mazelayout[ypos+y].substr(xpos+BLOCKWIDTH);	
	}
}


function gamemsg(msg)
{
	var x1 = leftmarg + (3.5* blockImage.width);
	var y1 = topmarg + (8 * blockImage.height);

	fill(0,0,0,180);
	rect(x1+6, y1+6, 110, 40);
	
	fill(255,255,155);
	textAlign(LEFT);
  	textSize(20);
		
	text(msg, leftmarg + (3.5* blockImage.width)+9, topmarg + (10 * blockImage.height)-7);

}

// Draw maze (or redraw specific line in maze)

var bheight=0;
var flash=0, dotmode=0;

function drawMaze(line=0)
{
	var x;
	var marg = blockImage.width * 3;
	
	flash=(flash+1)%12;
	
	if (DEBUG)
		textSize(14);

	var numlines;
	if (line <0)
		line = 0;
	
	if (line ==0) 
		numlines = mazelayout.length;
	else
		numlines = 1;
	
	for(y=line; y<numlines; y++) {
		
		for(x=0; x< mazelayout[y].length; x++) {
			fill(0,255,0);
			if (y==0 && DEBUG) 
				text(x, 5+ leftmarg + x* blockImage.width, topmarg- 5);
			var x1, y2, x2, y2
			x1 = leftmarg + x * blockImage.width;
			y1 = topmarg + y * blockImage.height;
			x2 = x1 + blockImage.width;
			y2 = y1 + blockImage.height;
		
			var curblock = mazelayout[y][x];
			if (curblock != " ") { 
				if (curblock=="1")
					fill(200,0,0,180);
				else if (curblock=="2")
					fill(0,200,200,180);
				else if (curblock=="3")
					fill(0,200,0,180);	
				else if (curblock=="4")
					fill(200,200,200,180);	
				else 
					fill(100,0,230);
					
				rect(x1+6, y1+6, 20, 20);
				// image(blockImage, 2*marg + x * blockImage.width, marg + y * blockImage.height);
			}
			
		}
		
		if (DEBUG) {
			fill(0,255,0);
			text(y, leftmarg-20, topmarg + (y+.7) * blockImage.height);
		}
		
	}
	fill(0,0,0);
}

// Check if a full line exists and remove if it does
function testlines()
{
	// Flagged for whether a line is full or not
	var filled;
	var y, x;
	for(y=1; y<mazelayout.length-1;y++) {
		filled=true;
		for(x=1;x<mazelayout[y].length && filled==true;x++){
			if(mazelayout[y][x]==" ")
				filled=false;
		}
		if (filled) {
			removeline(y);
		}
	}
}

function removeline(line)
{
	
	var s;
	var blankline = "#          #";
	
	for(y=line;y>1;y--) {
		mazelayout[y] = mazelayout[y-1];
	}
	mazelayout[0] = blankline;	
	score+=20;
	lines++;
}

function preload() 
{
	bgroundImage = loadImage("images/stbasils.jpg");
	
	//mazeImage.resize(550,600);
	
	blockImage = loadImage("images/bloc.png");

	IACTImage = loadImage("images/iact_symbol.png");
	
	splashImage = loadImage("images/splash.png");
	gameOverImage = loadImage("images/gameover3.png");
	gameOverImage.resize(300,0);
	buttonImage = loadImage("images/touchbutton.svg"); 
	
	themeWav = loadSound('sound/tetris_theme.mp3');
	
	
}

function debugDisplay()
{
  
  var marg = blockImage.width * 3;
	
  topleftx = 2 * marg;
  toplefty = marg;
 	
  //print("Adj x:" + round(adjx) + "Adj y: "+ round(adjy));
 
}

// Quick function to replace color pixels in an image
// Let's use have different coloured invaders

function recolor(newimage, newcolor)
{
	var x, y;
	var pixA, pixR, pixG, pixB;
	newimage.loadPixels();
	for (y=0; y<newimage.height; y++) {
		for (x=0; x < newimage.width; x++) {
			
			pixR = newimage.pixels[(x+y*newimage.width)*4];   // 4 pixels - RGB, A
			pixG = newimage.pixels[1+(x+y*newimage.width)*4];   // 4 pixels - RGB, A
			pixB = newimage.pixels[2+(x+y*newimage.width)*4];   // 4 pixels - RGB, A
			pixA = newimage.pixels[3+(x+y*newimage.width)*4];   // 4 pixels - RGB, A

			if (pixA != 0 && pixR==237 )
				newimage.set(x, y, color(red(newcolor),green(newcolor),blue(newcolor),pixA));	
		}
	}
	newimage.updatePixels();
}

function displayScore()
{
  textFont("Roboto");
  
  if(score > hiscore)
	  hiscore = score;

  textSize(20);
 
  textAlign(LEFT);
  fill(0,255,0);

  var txtScore = "000000" + score.toString();
  txtScore = txtScore.substr(score.toString().length+1, 5);
  text("Score", leftmarg, 20);
  text(txtScore, leftmarg, 42);

  textAlign(CENTER);
  fill(220,220,220);
  textSize(20);
  var txtHiScore = "000000" + hiscore.toString();
  txtHiScore = txtHiScore.substr(hiscore.toString().length+1, 5);
  text("Hi Score", 100+width/2, 20);
  text(txtHiScore, 100+ width/2, 42);
	
}
function displayLines()
{
  textFont("Roboto");
  
  textSize(20);
 
  textAlign(LEFT);
  fill(255,255,255);

  var txtLines = "00000" + lines.toString();
  txtLines = txtLines.substr(lines.toString().length+1, 5);
  text("Lines", 210 + width/2, 170);
  text(txtLines, 210 + width/2, 192);
	
}
function displayLives()
{
  textAlign(LEFT);
  textSize(20);
  // text("Lives: " + lives, 50, 20);
}

// Restore maze after dots and pellets have been eaten 
function restoremaze()
{
	for(y=0; y<mastermaze.length;y++) {
		mazelayout[y] = mastermaze[y];
	}
}

function resetmaze()
{
	seconds = 0;  // since new life
	restoremaze();

}
function setupGame()
{
	// Get Hi-Score
	
	if(!readCookie("tetris_hiscore")) {
		hiscore = 0;   
	} else {
		hiscore = readCookie("tetris_hiscore");   
	}
	
	
	// Change
	nextblock = floor(random(0,4));
	setactiveblock(nextblock);
	nextblock = floor(random(0,4));
	
	var ang = 0		

	// Put all ghosts in the house at the start
	
	// Restore maze
	
	restoremaze();	
	
	lives = 1;
	score = 0;
	level=0;
	lines=0;
	
	timer=0;
	seconds=0;
	if(!themeWav.isPlaying())
		themeWav.play();
	
}
function resetGame()
{
	resetmaze();
	seconds=0;
	ghosttime=0;
	mode=6;				// Get Ready!	
}

function windowResized() {
  //resizeCanvas(windowWidth, windowHeight);
  //width = 800;
 // height = 600;

  var fullwidth = windowHeight>windowWidth?windowWidth:windowHeight;
	
  var scale = fullwidth / 800;
	
//  camera.zoom = (scale);
//  camera.on();
  //camera.position.x=0;
  //camera.position.y=0;  
	
}

function setup() {
	
	//if (windowWidth < 800 && windowHeight > 800)
	createCanvas(windowWidth,windowHeight);  // 800, 720
	//else
		
	createCanvas(1280,720);
	
	leftmarg = (width - 250) / 2;  
	topmarg = (height - 400) / 2;

	IACTImage.resize(30,0);

	GSCALE = 1.0;
	
	mode = 2;	// show splash screen

	frameRate(60);
	setupGame();
	
	// Handle swipes and clicks - move to separate function
	
		  // set options to prevent default behaviors for swipe, pinch, etc
	  var options = {
		preventDefault: true
	  };

	  // document.body registers gestures anywhere on the page
	  var hammer = new Hammer(document.body, options);
	  hammer.get('swipe').set({
		direction: Hammer.DIRECTION_ALL
	  });

	  hammer.on('tap', tapped);
	  hammer.on("swipe", swiped);
	
}
	
function swiped(event) {
  
}

function tapped()
{
	if (mode==2 || lives ==0) {
	  lives=1;
	  mode=0;
	  
	  setupGame();		
   	  resetGame();
	}
}

// Show destination block

function drawdest()
{
	var y, maxy=-1;
	for(y=bheight; y<mazelayout.length-1, maxy==-1;y++) {
		if(!canmove(xpos, y)) {
			maxy = y-1;
		}
	}
	drawblock(xpos, maxy, true);
	
	//console.log("Maxy: " + maxy);
}

// Determine shortest direction ignoring opposite direction

var dir="";
function checkMovement()
{
  if (keyWentDown(LEFT_ARROW)) {
	 if(canmove(xpos-1,ypos) ){
		 dir="W"
	 };
  }
	  
 if (keyWentDown(RIGHT_ARROW) ) {
	 if(canmove(xpos+1, ypos)) {
		 dir='E';
	 }
  }

  if (keyWentDown(DOWN_ARROW)) { 
   	  dir="S";
  }
	
  if(keyWentDown(' ') || keyWentDown('x') || keyWentDown(UP_ARROW))
	  rotateblock();
}

var speed=0, deltay=0, deltax=0;

var pos=0, count=0;
function playGame(demomode=false)
{
	
  if(!themeWav.isPlaying())
		themeWav.play();

  displayScore();
  displayLines();
  displayLives();
  
  count++;

  fill(255,255,0);
     
   var x;

   // Speed up the game by 3 (for level 0)

   var gamespeed = level>0?level+3:2;

 // Cap the speed at 5 for sanity

   gamespeed = gamespeed>5?5:gamespeed;

   // Handle left and right motion smoothly 

   if(dir=='E') {
	   if(canmove(xpos+1,bheight)) {
		   deltax = deltax + 4;
		   if(deltax == 20) {
			   xpos++;
			   deltax=0;
			   dir='';
		   }
	   }
   } else if(dir=='W') {
   	   if(canmove(xpos-1,bheight)) {

		   deltax = deltax - 4;
		   if(deltax == -20) {
			   xpos--;
			   deltax=0;
			   dir='';
		   }
	   }
   }

  // Modify to adjust the speed of falling blocks


  if(!demomode && dir!='S')
 	checkMovement();

  if (canmove(xpos,bheight+1)) {
	 deltay=deltay+1;
		if(deltay==21)
		  deltay=0;
   }
  drawblock(xpos,bheight);
  shownextblock(nextblock);
  testlines();
	
  if(count%20==0 || dir=='S') {
		if(canmove(xpos,bheight+1)) {
		   bheight++;
		   deltay=0;
		} else {
			embedblock(xpos, bheight);
			setactiveblock(nextblock);
			nextblock = floor(random(0,3));
			xpos=4;
			bheight=0;
			deltax=0;
			dir='';
			if (!canmove(xpos, bheight)) {
				lives=0;
				mode=5;  // play death sequence
			}
		}

		if(bheight==18)
			bheight=0;
   }
	
  // Display location of block when it falls
	
  drawdest();
}

var gcount=0;
var demoduration=0;

function gameOver()
{
	textSize(80);
	textAlign(CENTER);
	gcount = (gcount+ 1) % 60;
	noStroke();
	
	image(gameOverImage,width/2-gameOverImage.width/2,height/2 - gameOverImage.height);
	
	createCookie("tetris_hiscore", hiscore, 1000);
	
	if (gcount < 30) {
		 fill(0,255,2550);
		 textSize(20);
		 text("Press any key to restart", width/2, height/2 + 100);
	} else {
		fill(0,255,0);
	}
   
	if (keyWentDown("r") || keyWentDown("x") || keyWentDown(" ")) {
	  lives=1;
	  mode=0;
	
	  setupGame();		
   	  resetGame();
      
  	}
}

function iactlogo()
{
	image(IACTImage, 40, height-80);  
}

var fcount=0;
function drawBackground()
{
	background(0);
	image(bgroundImage,(width-bgroundImage.width)/3,0);
	drawMaze();
	iactlogo();	
}
// Draw stripes on foreground

function drawForeground()
{
	var stripeheight = 50;

	if (DEBUG)
		showgridpos(pacman);

}

var timer=0, seconds=0;
var gameovertick=0;
var lostlifetime=0;

function draw() 
{	
	// Handle ghosts release from home before they start chasing
	
	timer += 1;
	
	// Main game loop mode == 0 
	if (mode == 0 ) { 
		
		drawBackground();	
		drawForeground();

		playGame();

	// Game over mode - display message and return to splash screen 
		
	} else if (mode == 1) {
		
		drawBackground();
		drawForeground();
		
		if(timer % 30 == 0) {
			gameovertick++;
			// switch back to title screen after 30 seconds
			if(gameovertick == 10) {
				gameovertick=0;
				mode = 2;
			}
				
		}
		gameOver();
		
	// Splash screen mode 
		
	} else if (mode == 2) {
		
		drawBackground();
		SplashScreen();
	} else if (mode == 3) {
		drawBackground()
		
	// Life lost - delay action of ghosts and play Pacman death sequence.
		
	} else if (mode == 5) {
		drawBackground();
		drawForeground();
				
		if(timer % 30 == 0) {
			lostlifetime++;
		
			if(lostlifetime == 1) {
				lostlifetime=0;
				
				if(lives <= 0) {
					mode=1;				// Game over
				} else {
					resetGame();
					mode = 0;
				}
			}
		}
	
	// Start of new game
		
	} else if (mode == 6) {
		drawBackground();
		drawSprites();
		drawForeground();
		
		//if (level == 0 && !startWav.isPlaying())
		//	startWav.play();
		
		//else if (level > 0 && !intermissionWav.isPlaying())
		//	intermissionWav.play();
			
		gamemsg("Get Ready!");
		
		if(timer % 30 == 0) {
			lostlifetime++;
			// Reset pacman and restart 
			if(lostlifetime == 3) {
				lostlifetime=0;
				resetGame();
				mode = 0;
			}
		}
	} else if (mode==7){
		
		if (timer % 60 == 0) {
			demoduration++;
			if(demoduration == 2) {
				console.log("demo mode"); 
			} else if (demoduration >= 13) {
				demoduration=0;
				mode=2;
			}
		}
		gameDemo();
		if (timer % 60 < 30)
			gamemsg("Demo Mode");
	}
		
	if (DEBUG)
		debugDisplay();
}

function gameDemo()
{
	drawBackground();
	drawForeground();

	level = 0;
	playGame(true);
	checkGameStart();
}

function checkGameStart()
{
   if (keyWentDown("r") || keyWentDown("x") || keyWentDown(32)) {
	  lives=1;
	  mode=0;
	  
	  setupGame();		
   	  resetGame();
  	}
	
}

function copyImg(originalImg)
{
	var x, w= originalImg.width, h=originalImg.height;
	var copyImg;
	
	// Create separate copies of each blockade.
	copyImg = createImage(w,h);
	copyImg.copy(originalImg,0,0,w,h,0,0,w,h)
	return(copyImg);
}

// Simulate lower resolution screen
function drawgrid()
{
	var x;
	stroke(56);
	for(x=0; x<width; x+=10) {
		line(x, height, x, 0);
	}
	
	for(x=0; x<height; x+=10) {
		line(0, x, width, x);
	}	
		
}

