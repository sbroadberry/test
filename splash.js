// JavaScript Document
// Opening Screen code

var msg="";
msg = msg + "     Learn how to write TETRIS on IACT's Foundations in Gaming course using ";
msg = msg + "JavaScript and the P5JS library which will teach you everything you need to know. ";
msg = msg + "Visit www.iact.ie!                                  ";

var showdemo=0;
var scount=0;

function SplashScreen()
{
	textAlign(CENTER);

	noStroke();
	background(0);
	image(bgroundImage,(width-bgroundImage.width)/2,0);
	image(splashImage,(width-splashImage.width)/2,0);
	iactlogo();

	if (timer%30==0)
		showdemo++;

	// Show demo mode after 5 seconds
	
	if(showdemo>=10) {
		showdemo=0;
		setupGame();		
		resetGame();
		mode=7;
	}
	
	if (showdemo%2 ==0) {
		fill(0,255,255);
		textSize(25);
		text("Press any key to start", width/2, height- 85);
	} else {
		fill(0,255,0);
		textSize(25);
		text("Press any key to start", width/2, height- 85);
	}

	checkGameStart();
	
	scroll(msg);
}

var pos=500; // splashImage.width;

function scroll(msg)
{

	textSize(20);
	textAlign(LEFT);
	fill(255,255,255);
	text(msg, pos, height- 30);
	pos-=2;
	if (pos < -(splashImage.width))
		pos = splashImage.width;
	
	fill(0,0,0);
	rect(width-(width-splashImage.width)/2-30, splashImage.height-50,30+(width-splashImage.width)/2,30);
	rect(0, splashImage.height-50,30+(width-splashImage.width)/2,30);
	
}