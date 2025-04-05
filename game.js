 // No longer need window.onload wrapper with defer attribute on script tag

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const codeTextArea = document.getElementById('shipCode');
const runCodeButton = document.getElementById('runCodeButton');
const outputArea = document.getElementById('output');

// Set canvas dimensions (adjust as needed)
canvas.width = 800;
canvas.height = 600;

// Game state variables (example)
let ships = [];
let bullets = [];
let gameRunning = true;
let explosions = [];
const keysPressed = {
    ArrowUp: false,
    ArrowLeft: false,
    ArrowRight: false,
    Space: false, // For shooting ("Space")
    " ": false    // For shooting (" ") - handle both common key values
};
let ship2AI = null; // Variable to hold the AI function
const PLAYER_SHIP_INDEX = 0;
const AI_SHIP_INDEX = 1;

// --- JavaScript AI API ---
const aiApi = {
    turnLeft: function(ship) {
        if (ship) ship.rotate(-1);
    },
    turnRight: function(ship) {
        if (ship) ship.rotate(1);
    },
    thrust: function(ship) {
        if (ship) ship.accelerate();
    },
    shoot: function(ship) {
        const now = Date.now();
        // Cooldown is now managed per ship instance
        if (ship && (!ship.lastShotTime || now - ship.lastShotTime > 500)) { 
             ship.shoot();
             ship.lastShotTime = now;
        }
    },
    scanEnemy: function(ship) {
        const playerShip = ships[PLAYER_SHIP_INDEX];
        if (!ship || !playerShip) return null;
        
        const dx = playerShip.x - ship.x;
        const dy = playerShip.y - ship.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angleToPlayer = Math.atan2(dy, dx);
        let angleDiff = angleToPlayer - ship.angle;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        
        const scanConeAngle = Math.PI / 4;
        const enemyDetected = Math.abs(angleDiff) <= scanConeAngle;
        
        if (ship === ships[AI_SHIP_INDEX]) {
            ctx.save();
            ctx.beginPath();
            const scanRadius = 50;
            const startAngle = ship.angle - Math.PI / 4;
            const endAngle = ship.angle + Math.PI / 4;
            ctx.arc(ship.x, ship.y, scanRadius, startAngle, endAngle);
            if (enemyDetected) {
                const isBlinkOn = Math.floor(Date.now() / 300) % 2 === 0;
                ctx.strokeStyle = isBlinkOn ? 'rgba(255,0,0,0.8)' : 'rgba(255,0,0,0.1)';
            } else {
                ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
            }
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
        }
        
        return enemyDetected ? { distance: distance, angle: angleDiff } : null;
    },
    getAngle: function(ship) {
        return ship ? ship.angle : 0;
    },
    getX: function(ship) {
        return ship ? ship.x : 0;
    },
    getY: function(ship) {
        return ship ? ship.y : 0;
    }
};

// Skulpt code removed

class Bullet {
    constructor(x, y, angle, color = 'yellow') {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = 7;
        this.radius = 3;
        this.color = color;
    }

    update() {
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    // Check if bullet is off-screen
    isOffscreen() {
        return this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height;
    }
}

// --- Ship Class ---
class Ship {
    constructor(x, y, color = 'white') {
        this.x = x;
        this.y = y;
        this.width = 20;
        this.height = 30;
        this.angle = 0; // Angle in radians (0 = facing right)
        this.speed = 0;
        this.rotationSpeed = 0.05; // Radians per frame
        this.acceleration = 0.1;
        this.friction = 0.98;
        this.color = color;
        this.maxSpeed = 5;
        this.health = 100;
        this.radius = this.height / 2; // Approximate radius for collision
        this.lastShotTime = 0; // Initialize cooldown timer
    }

    // Rotate the ship
    rotate(direction) { // -1 for left, 1 for right
        this.angle += this.rotationSpeed * direction;
    }

    // Accelerate the ship
    accelerate() {
        const thrustX = Math.cos(this.angle) * this.acceleration;
        const thrustY = Math.sin(this.angle) * this.acceleration;
        
        // Apply thrust (simplified, ideally use vectors)
        this.speed += this.acceleration; // Simple speed increase for now
        if (this.speed > this.maxSpeed) {
            this.speed = this.maxSpeed;
        }
    }

    // Update ship position
    update() {
        // Apply friction
        this.speed *= this.friction;
        if (Math.abs(this.speed) < 0.01) {
            this.speed = 0;
        }

        // Move ship based on angle and speed
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;

        // Wrap around screen edges
        if (this.x < 0) this.x = canvas.width;
        if (this.x > canvas.width) this.x = 0;
        if (this.y < 0) this.y = canvas.height;
        if (this.y > canvas.height) this.y = 0;
    }

    // Draw the ship (simple triangle for now)
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.beginPath();
        ctx.moveTo(this.height / 2, 0); // Nose
        ctx.lineTo(-this.height / 2, this.width / 2); // Bottom left
        ctx.lineTo(-this.height / 2, -this.width / 2); // Top left
        ctx.closePath();
        ctx.strokeStyle = this.color;
        ctx.stroke();
        ctx.restore();
    }

    shoot() {
        // Calculate bullet starting position at the nose of the ship
        const bulletX = this.x + Math.cos(this.angle) * (this.height / 2);
        const bulletY = this.y + Math.sin(this.angle) * (this.height / 2);

        // Add a new bullet to the global bullets array
        bullets.push(new Bullet(bulletX, bulletY, this.angle, this.color)); // Use ship's color for bullet
    }
}

function addExplosion(x, y) {
    explosions.push({ x: x, y: y, time: 0, duration: 30, initialRadius: 10, maxRadius: 40 });
}

function updateAndDrawExplosions() {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const exp = explosions[i];
        exp.time++;
        const progress = exp.time / exp.duration;
        const currentRadius = exp.initialRadius + (exp.maxRadius - exp.initialRadius) * progress;
        const alpha = 1 - progress;
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, currentRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 165, 0, ${alpha})`;
        ctx.fill();
        if(exp.time >= exp.duration) {
            explosions.splice(i, 1);
        }
    }
}
 
// --- Game Loop ---
function gameLoop() {
    if (!gameRunning) return;

    // 1. Clear canvas
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Update game objects
    ships.forEach(ship => ship.update());
    // Handle player input for the first ship
    const playerShip = ships[0];
    if (playerShip) {
        if (keysPressed.ArrowLeft) {
            playerShip.rotate(-1);
        }
        if (keysPressed.ArrowRight) {
            playerShip.rotate(1);
        }
        if (keysPressed.ArrowUp) {
            playerShip.accelerate();
        }
        // Check for both possible space key values
        if (keysPressed.Space || keysPressed[" "]) { 
            const now = Date.now();
            if (!playerShip.lastShotTime || now - playerShip.lastShotTime > 200) { // 200ms cooldown for player
                playerShip.shoot();
                playerShip.lastShotTime = now;
            }
            // Key state is still handled by keyup listener
        }
    }

    // Update bullets
    bullets.forEach((bullet, index) => {
        bullet.update();
        // Remove bullets that go off-screen
        if (bullet.isOffscreen()) {
            bullets.splice(index, 1);
        }
    });

    // 3. Handle collisions
    // Iterate backwards to safely remove items while iterating
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        for (let j = ships.length - 1; j >= 0; j--) {
            const ship = ships[j];

            // Simple distance check (circle collision)
            const dx = bullet.x - ship.x;
            const dy = bullet.y - ship.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Check if bullet hit ship (and avoid hitting own ship immediately after firing - basic check)
            // A more robust solution would track bullet origin or add a brief immunity.
            // For now, let's assume bullets don't hit the ship that fired them instantly.
            // A simple check could be if the bullet color matches the ship color, but that's not foolproof if multiple ships have the same color.
            // Let's skip self-collision check for now and assume bullets hit any ship.

            if (distance < bullet.radius + ship.radius) {
                // Collision detected! Add explosion effect.
                addExplosion(ship.x, ship.y);
                bullets.splice(i, 1); // Remove bullet
                ship.health -= 10; // Decrease ship health (adjust damage as needed)

                if (ship.health <= 0) {
                    // Ship destroyed
                    ships.splice(j, 1); // Remove ship
                }
                
                // Since bullet is removed, break inner loop and check next bullet
                break; 
            }
        }
    }


    // 4. Draw game objects
    ships.forEach(ship => ship.draw());
    bullets.forEach(bullet => bullet.draw());

    // Execute AI for ship 2 if loaded
    const aiShip = ships[1]; // Assuming ship 2 is the AI ship
    if (aiShip && typeof ship2AI === 'function') {
        try {
            // Call the loaded JavaScript AI function
            ship2AI(aiShip, aiApi); 
        } catch (e) {
            // Display runtime errors from the AI code
            outputArea.textContent = `--- AI Runtime Error ---\n${e.toString()}\n${e.stack}\n`; // Show stack
            ship2AI = null; // Stop trying to run faulty AI
        }
    }

    drawHealthBars();
    updateAndDrawExplosions();
    // 5. Request next frame
    requestAnimationFrame(gameLoop);
}

function drawHealthBars() {
    const playerShip = ships[0]; // Player's ship is at index 0
    const aiShip = ships[1];     // AI ship is at index 1
    
    // Draw Player health bar on left
    if (playerShip) {
        const barWidth = 200;
        const barHeight = 20;
        const x = 20;
        const y = canvas.height - 40;
        ctx.fillStyle = 'gray';
        ctx.fillRect(x, y, barWidth, barHeight);
        const healthPercentage = Math.max(0, playerShip.health) / 100;
        ctx.fillStyle = 'lime';
        ctx.fillRect(x, y, barWidth * healthPercentage, barHeight);
        ctx.fillStyle = 'white';
        ctx.font = "16px Arial";
        ctx.fillText("Player Health", x, y - 5);
    }
    
    // Draw AI health bar on right
    if (aiShip) {
        const barWidth = 200;
        const barHeight = 20;
        const x = canvas.width - barWidth - 20;
        const y = canvas.height - 40;
        ctx.fillStyle = 'gray';
        ctx.fillRect(x, y, barWidth, barHeight);
        const healthPercentage = Math.max(0, aiShip.health) / 100;
        ctx.fillStyle = 'red';
        ctx.fillRect(x, y, barWidth * healthPercentage, barHeight);
        ctx.fillStyle = 'white';
        ctx.font = "16px Arial";
        ctx.fillText("AI Health", x, y - 5);
    }
}
    
/*
// Example JavaScript AI Code
// The function 'runAI' will be called each frame.
// It receives the 'ship' object and an 'api' object.
//
// API functions:
// api.turnLeft(ship)
// api.turnRight(ship)
// api.thrust(ship)
// api.shoot(ship)
// api.scanEnemy(ship) -> returns { distance, angle } or null
// api.getAngle(ship) -> returns angle in radians
// api.getX(ship) -> returns x coordinate
// api.getY(ship) -> returns y coordinate
//
// Corrected AI Logic: (if angleDiff > 0 then turn right; if angleDiff < 0 then turn left)
// function runAI(ship, api) {
//   const enemyInfo = api.scanEnemy(ship);
//   const facingTolerance = 0.1; // Radians (approx 5.7 degrees)
//   const shootingDistance = 250; // Distance within which to start shooting
//   const tooCloseDistance = 80; // Distance below which to stop thrusting
//
//   if (enemyInfo) {
//     const angleDiff = enemyInfo.angle;
//     const distance = enemyInfo.distance;
//
//     // --- Aiming ---
//     if (Math.abs(angleDiff) > facingTolerance) {
//       if (angleDiff > 0) {
//         api.turnRight(ship); // Correct: Enemy is counter-clockwise, so turn right.
//       } else {
//         api.turnLeft(ship); // Correct: Enemy is clockwise, so turn left.
//       }
//     } else {
//       if (distance < shootingDistance) {
//         api.shoot(ship);
//       }
//       if (distance > tooCloseDistance) {
//         api.thrust(ship);
//       }
//     }
//   } else {
//     api.turnRight(ship); 
//   }
// }
*/
 // --- AI Code Loading (JavaScript) ---
function loadAICode() {
    const code = codeTextArea.value;
    outputArea.textContent = "Loading AI...\n"; // Clear previous output
    ship2AI = null; // Reset AI

    try {
        // Use the Function constructor to create a function from the code.
        // We expect the user code to define a function named 'runAI'.
        // We wrap the user code to capture the runAI function if defined.
        const wrappedCode = `
            let userRunAI = null;
            ${code} 
            if (typeof runAI === 'function') {
                userRunAI = runAI;
            }
            return userRunAI; // Return the function
        `;
        
        const getAIFunction = new Function(wrappedCode);
        const aiFunc = getAIFunction(); // Execute the wrapper to get runAI

        if (typeof aiFunc === 'function') {
             ship2AI = aiFunc; // Store the AI function
             outputArea.textContent += "AI Loaded Successfully.\n";
        } else {
             outputArea.textContent += "Error: Could not find a function named 'runAI' in the code.\n";
        }

    } catch (e) {
        // Catch errors during Function constructor or execution
        outputArea.textContent += `\n--- AI Loading/Compilation Error ---\n${e.toString()}\n${e.stack}\n`;
    }
}


// --- Initialization ---
function initGame() {
    // Create initial ships (example)
    ships.push(new Ship(canvas.width / 2, canvas.height / 2, 'cyan'));
    ships.push(new Ship(100, 100, 'red')); // Example opponent

    // Start the game loop
    gameLoop();
}

// --- Keyboard Input Handling ---
document.addEventListener('keydown', (event) => {
    // Handle both "Space" and " "
    const key = event.key === " " ? " " : event.key; 
    if (key in keysPressed) {
        keysPressed[key] = true;
    }
});

document.addEventListener('keyup', (event) => {
    // Handle both "Space" and " "
    const key = event.key === " " ? " " : event.key;
    if (key in keysPressed) {
        keysPressed[key] = false;
    }
});

// --- Event Listeners ---
runCodeButton.addEventListener('click', loadAICode);

    // --- Start the game ---
    initGame();

    // Skulpt readiness check removed
    // initGame(); // Removed duplicate call

// End of script
