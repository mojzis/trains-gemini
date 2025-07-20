let { init, GameLoop, Sprite, initPointer, onPointer } = kontra;

let { canvas, context } = init();

initPointer();

// --- Audio Context ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (!audioCtx) return;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'switch') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(100, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.5);
    } else if (type === 'pass') {
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.5);
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.5);
    } else if (type === 'collision') {
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 1);
    }

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 1);
}

// --- Game Configuration ---
const trackYPositions = [100, 250, 400, 550];
const trackColor = '#404040';
const trackWidth = 5;

const switchPositions = [
    { x: 200, y: trackYPositions[0], toTrack: 1, active: false }, // Track 0 to Track 1
    { x: 400, y: trackYPositions[1], toTrack: 2, active: false }, // Track 1 to Track 2
    { x: 600, y: trackYPositions[1], toTrack: 3, active: false }  // Track 1 to Track 3 (before stop)
];
const switchColor = '#a52a2a';
const switchWidth = 7;
const switchLength = 50;

const trainTypes = {
    blue: { color: '#6666cc', speed: 1, points: 1 },
    red: { color: '#cc6666', speed: 1.5, points: 2 }
};

const initialTrainSpeed = 1;
let trainSpeed = initialTrainSpeed;
const initialTrainSpawnInterval = 2500; // in ms
let trainSpawnInterval = initialTrainSpawnInterval;
const minTrainSpacing = 150; // Minimum horizontal space between trains
const stopPosition = 700; // X-coordinate for the stop on track 1
const stopTrack = 1; // The track where the stop is located
const stopDuration = 2000; // How long trains stop for (in ms)

let lastTrainSpawn = 0;
let trains = [];
let gameOver = false;
let score = 0;
let highScore = getHighScore();

function getHighScore() {
    return localStorage.getItem('highScore') || 0;
}

function saveHighScore() {
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('highScore', highScore);
    }
}

function updateDifficulty() {
    trainSpeed = initialTrainSpeed + Math.floor(score / 10) * 0.15;
    trainSpawnInterval = Math.max(500, initialTrainSpawnInterval - Math.floor(score / 5) * 75);
}

// --- Train Class ---
function Train(properties) {
    const type = properties.type || 'blue';
    const typeProps = trainTypes[type];

    const sprite = Sprite({
        ...properties,
        width: 40,
        height: 20,
        color: typeProps.color,
        context: context
    });

    sprite.track = properties.track || 0;
    sprite.speed = typeProps.speed;
    sprite.points = typeProps.points;
    sprite.numCars = properties.numCars || 1; // Default to 1 car
    sprite.isStopped = false; // Initialize stopped state

    // Attach our custom methods to the sprite instance
    sprite.draw = function() {
        for (let i = 0; i < this.numCars; i++) {
            const carX = this.x - (i * (this.width + 5)); // 5 pixels for spacing
            this.context.fillStyle = this.color;
            this.context.fillRect(carX, this.y, this.width, this.height);

            this.context.fillStyle = '#a9a9a9';
            this.context.fillRect(carX + 5, this.y + 5, 10, 10);
            this.context.fillRect(carX + 25, this.y + 5, 10, 10);
        }
    };

    sprite.collidesWith = function(otherSprite) {
        return this.x < otherSprite.x + otherSprite.width &&
               this.x + this.width > otherSprite.x &&
               this.y < otherSprite.y + otherSprite.height &&
               this.y + this.height > otherSprite.y;
    };

    sprite.update = function() {
        if (gameOver) return;

        // Handle stopping at the station
        if (this.track === stopTrack && this.x >= stopPosition && !this.isStopped) {
            this.x = stopPosition; // Snap to stop position
            this.isStopped = true;
            this.stopTime = Date.now();
        }

        if (this.isStopped) {
            if (Date.now() - this.stopTime > stopDuration) {
                this.isStopped = false; // Resume movement
                this.x = stopPosition + 10; // Move past the stop position to avoid re-triggering
            }
        }

        // Only move the train if it's not stopped
        if (!this.isStopped) {
            this.x += this.speed * trainSpeed;
        }

        switchPositions.forEach(s => {
            if (s.active && Math.abs(this.x - s.x) < 5 && this.y === s.y) {
                this.y = trackYPositions[s.toTrack];
                this.track = s.toTrack; // Update the train's internal track property
                playSound('switch');
            }
        });
    };

    return sprite;
}



// --- Drawing Functions ---

function drawTracks() {
    context.strokeStyle = trackColor;
    context.lineWidth = trackWidth;
    context.beginPath();
    trackYPositions.forEach(y => {
        context.moveTo(0, y + (Math.random() * 1 - 0.5)); // Smaller random start Y
        for (let x = 0; x <= canvas.width; x += 10) { // Smaller step for smoother line
            context.lineTo(x, y + (Math.random() * 1 - 0.5)); // Smaller random Y offset
        }
    });
    context.stroke();
}

function drawSwitches() {
    switchPositions.forEach(s => {
        // Draw switch track
        context.strokeStyle = s.active ? '#00ff00' : switchColor;
        context.lineWidth = switchWidth;
        context.beginPath();
        const fromY = s.y;
        const toY = s.active ? trackYPositions[s.toTrack] : s.y;
        const controlX = s.x + (Math.random() * 4 - 2); // Smaller random X offset
        const controlY = fromY + (toY - fromY) / 2 + (Math.random() * 4 - 2); // Smaller random Y offset

        context.moveTo(s.x - switchLength / 2, fromY + (Math.random() * 1 - 0.5)); // Smaller random start Y
        context.quadraticCurveTo(controlX, controlY, s.x + switchLength / 2, toY + (Math.random() * 1 - 0.5)); // Smaller random end Y
        context.stroke();
        
        // Draw clickable area indicator
        context.fillStyle = 'rgba(255, 255, 0, 0.2)';
        context.fillRect(s.x - switchLength * 1.5, s.y - 50, switchLength * 3, 100);
    });
}

function drawGameOver() {
    if (!gameOver) return;
    context.fillStyle = 'rgba(0, 0, 0, 0.5)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = 'white';
    context.font = '48px Arial';
    context.textAlign = 'center';
    context.fillText('Game Over', canvas.width / 2, canvas.height / 2);
}

function drawScore() {
    context.fillStyle = 'black';
    context.font = '24px Arial';
    context.textAlign = 'left';
    context.fillText('Score: ' + score, 10, 30);
}

function drawHighScore() {
    context.fillStyle = 'black';
    context.font = '24px Arial';
    context.textAlign = 'right';
    context.fillText('High Score: ' + highScore, canvas.width - 10, 30);
}

function drawStop() {
    context.fillStyle = '#ff0000'; // Red color for the stop
    context.fillRect(stopPosition, trackYPositions[stopTrack] - 10, 10, 20); // A small red rectangle
}

function drawDebugInfo() {
    context.fillStyle = 'black';
    context.font = '12px Arial';
    context.textAlign = 'left';
    let y = 60;
    trains.forEach((train, i) => {
        const status = train.isStopped ? 'STOPPED' : 'MOVING';
        const timeLeft = train.isStopped ? Math.max(0, stopDuration - (Date.now() - train.stopTime)) : 0;
        context.fillText(`Train ${i}: x=${Math.floor(train.x)}, track=${train.track}, ${status} ${timeLeft}ms`, 10, y);
        y += 15;
    });
}

// --- Collision Detection ---
function checkCollisions() {
    for (let i = 0; i < trains.length; i++) {
        for (let j = i + 1; j < trains.length; j++) {
            let train1 = trains[i];
            let train2 = trains[j];

            if (Math.abs(train1.y - train2.y) < 10 && train1.collidesWith(train2)) {
                if (!gameOver) {
                    playSound('collision');
                    gameOver = true;
                    saveHighScore();
                }
            }
        }
    }
}


// --- Game Loop ---

let loop = GameLoop({
  update: function(dt) {
    if (gameOver) return;
    let now = Date.now();
    if (now - lastTrainSpawn > trainSpawnInterval) {
        const lastTrain = trains[trains.length - 1];
        let canSpawn = true;

        if (lastTrain) {
            // Calculate required spacing based on relative speeds
            const newTrainType = Math.random() < 0.3 ? 'red' : 'blue';
            const newTrainSpeed = trainTypes[newTrainType].speed * trainSpeed;
            const lastTrainCurrentSpeed = lastTrain.speed * trainSpeed;

            // If the new train is faster or same speed, ensure a minimum distance
            // If the new train is slower, the distance can be smaller as it won't catch up as fast
            let requiredDistance = minTrainSpacing;
            if (newTrainSpeed >= lastTrainCurrentSpeed) {
                requiredDistance = minTrainSpacing + (newTrainSpeed - lastTrainCurrentSpeed) * 100; // Scale by a factor
            }

            if ((canvas.width - lastTrain.x) < requiredDistance) {
                canSpawn = false;
            }
        }

        if (canSpawn) {
            lastTrainSpawn = now;
            const type = Math.random() < 0.3 ? 'red' : 'blue';
            const numCars = Math.floor(Math.random() * 3) + 1; // 1 to 3 cars
            trains.push(new Train({
                x: -40,
                y: trackYPositions[0],
                anchor: {x: 0.5, y: 0.5},
                type: type,
                numCars: numCars,
                context: context, // Pass the context
                trainTypes: trainTypes // Pass trainTypes
            }));
        }
    }

    trains.forEach(train => train.update());
    checkCollisions();

    // Remove trains that are off-screen and increment score
    let trainsOnScreen = [];
    for (const train of trains) {
        if (train.x < canvas.width) {
            trainsOnScreen.push(train);
        } else {
            score += train.points * train.numCars;
            playSound('pass');
        }
    }
    trains = trainsOnScreen;

    updateDifficulty();
  },
  render: function() {
    drawTracks();
    drawSwitches();
    trains.forEach(train => train.render());
    drawScore();
    drawHighScore();
    drawStop();
    drawDebugInfo();
    drawGameOver();
  }
});

loop.start();

// --- Event Handling ---
document.getElementById('restart').addEventListener('click', function() {
    trains = [];
    gameOver = false;
    score = 0;
    trainSpeed = initialTrainSpeed;
    trainSpawnInterval = initialTrainSpawnInterval;
});

onPointer('down', function(e, object) {
    if (gameOver) return;
    
    console.log('Click at:', e.x, e.y);
    
    switchPositions.forEach((s, index) => {
        const xDist = Math.abs(e.x - s.x);
        const yDist = Math.abs(e.y - s.y);
        const isNearX = xDist < switchLength * 1.5; // Increased from switchLength to switchLength * 1.5
        const isNearY = yDist < 50; // Increased from 30 to 50
        
        console.log(`Switch ${index} at (${s.x}, ${s.y}): xDist=${xDist}, yDist=${yDist}, nearX=${isNearX}, nearY=${isNearY}, active=${s.active}`);

        if (isNearX && isNearY) {
            s.active = !s.active;
            playSound('switch');
            console.log(`Switch ${index} toggled to ${s.active}`);
        }
    });
});