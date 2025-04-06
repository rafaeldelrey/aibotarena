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
let particles = [];
const keysPressed = {
    KeyW: false,     // Forward (was ArrowUp)
    KeyA: false,     // Turn left (was ArrowLeft)
    KeyD: false,     // Turn right (was ArrowRight)
    KeyS: false,     // Backward (new)
    KeyQ: false,     // Rotate turret left (new)
    KeyE: false,     // Rotate turret right (new)
    Space: false,    // For shooting ("Space")
    " ": false,      // For shooting (" ") - handle both common key values
    KeyO: false      // For overburn ("O")
};
let ship2AI = null; // Variable to hold the AI function
const PLAYER_SHIP_INDEX = 0;
const AI_SHIP_INDEX = 1;
let lastFrameTime = null;

// --- JavaScript AI API ---
const aiApi = {
    turnLeft: function(ship) {
        if (ship) ship.rotate(-1);
    },
    turnRight: function(ship) {
        if (ship) ship.rotate(1);
    },
    turnTurretLeft: function(ship) {
        if (ship) ship.rotateTurret(-1);
    },
    turnTurretRight: function(ship) {
        if (ship) ship.rotateTurret(1);
    },
    setTurretAngle: function(ship, angleDegrees) {
        if (ship) {
            // Convert degrees to radians
            const angleRad = (angleDegrees * Math.PI) / 180;
            ship.setTurretAngle(angleRad);
        }
    },
    thrust: function(ship) {
        if (ship) ship.accelerate();
    },
    enableOverburn: function(ship, enable = true) {
        if (ship) ship.setOverburn(enable);
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
        
        // Calculate angle to player relative to the turret angle (not ship angle)
        const angleToPlayer = Math.atan2(dy, dx);
        let angleDiff = angleToPlayer - ship.turret_angle;
        
        // Normalize angle difference to -PI to PI
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        
        const scanConeAngle = Math.PI / 4; // 45 degrees scan cone
        const enemyDetected = Math.abs(angleDiff) <= scanConeAngle;
        
        // Visual feedback for scanning
        if (ship === ships[AI_SHIP_INDEX]) {
            ctx.save();
            ctx.beginPath();
            const scanRadius = 200; // Longer scanning radius
            const startAngle = ship.turret_angle - scanConeAngle;
            const endAngle = ship.turret_angle + scanConeAngle;
            ctx.moveTo(ship.x, ship.y);
            ctx.arc(ship.x, ship.y, scanRadius, startAngle, endAngle);
            ctx.closePath();
            
            if (enemyDetected) {
                // Detected enemy - show blinking red scan cone
                const isBlinkOn = Math.floor(Date.now() / 300) % 2 === 0;
                ctx.fillStyle = isBlinkOn ? 'rgba(255,0,0,0.2)' : 'rgba(255,0,0,0.05)';
            } else {
                // No enemy - show blue scan cone
                ctx.fillStyle = 'rgba(0, 100, 255, 0.1)';
            }
            ctx.fill();
            ctx.restore();
        }
        
        // Only return enemy info if within scan cone
        return enemyDetected ? { 
            distance: distance, 
            angle: angleDiff,
            x: playerShip.x, 
            y: playerShip.y,
            speed: playerShip.speed
        } : null;
    },
    getShipInfo: function(ship) {
        if (!ship) return null;
        return {
            angle: ship.angle,
            turretAngle: ship.turret_angle,
            x: ship.x,
            y: ship.y,
            speed: ship.speed,
            health: ship.health,
            heat: ship.heat,
            maxHeat: ship.maxHeat,
            isShutdown: ship.isShutdown,
            isOverburn: ship.isOverburn
        };
    },
    getAngle: function(ship) {
        return ship ? ship.angle : 0;
    },
    getTurretAngle: function(ship) {
        return ship ? ship.turret_angle : 0;
    },
    getX: function(ship) {
        return ship ? ship.x : 0;
    },
    getY: function(ship) {
        return ship ? ship.y : 0;
    },
    getHeat: function(ship) {
        return ship ? ship.heat : 0;
    },
    getCanvasSize: function() {
        return {
            width: canvas.width,
            height: canvas.height
        };
    }
};

// Skulpt code removed

class Bullet {
    constructor(x, y, angle, color = 'yellow', damageMultiplier = 1) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = 7;
        this.radius = 3;
        this.color = color;
        this.damageMultiplier = damageMultiplier;
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
        this.turret_angle = 0; // Turret angle in radians
        this.speed = 0;
        this.rotationSpeed = 0.05; // Radians per frame
        this.turretRotationSpeed = 0.08; // Turret rotates faster than ship
        this.acceleration = 0.1;
        this.friction = 0.98;
        this.color = color;
        this.maxSpeed = 5;
        this.health = 100;
        this.heat = 0;
        this.maxHeat = 100;
        this.heatDissipationRate = 0.2; // Heat lost per frame
        this.heatGenerationFire = 15; // Heat generated when firing
        this.isOverburn = false;
        this.overburnSpeedMultiplier = 1.5;
        this.overburnHeatGeneration = 0.5; // Additional heat per frame when overburning
        this.isShutdown = false; // Whether the ship is shutdown due to overheating
        this.radius = this.height / 2; // Approximate radius for collision
        this.lastShotTime = 0; // Initialize cooldown timer
        this.memory = {}; // Persistent memory for AI
    }

    // Rotate the ship
    rotate(direction) { // -1 for left, 1 for right
        // Only allow rotation if not shutdown
        if (!this.isShutdown) {
            this.angle += this.rotationSpeed * direction;
        }
    }

    // Rotate the turret
    rotateTurret(direction) { // -1 for left, 1 for right
        // Only allow rotation if not shutdown
        if (!this.isShutdown) {
            this.turret_angle += this.turretRotationSpeed * direction;
            // Normalize angle between 0 and 2π
            while (this.turret_angle < 0) this.turret_angle += Math.PI * 2;
            while (this.turret_angle >= Math.PI * 2) this.turret_angle -= Math.PI * 2;
        }
    }

    // Set turret to specific angle
    setTurretAngle(angle) {
        if (!this.isShutdown) {
            this.turret_angle = angle;
            // Normalize angle
            while (this.turret_angle < 0) this.turret_angle += Math.PI * 2;
            while (this.turret_angle >= Math.PI * 2) this.turret_angle -= Math.PI * 2;
        }
    }

    // Accelerate the ship
    accelerate() {
        // Only allow acceleration if not shutdown
        if (this.isShutdown) return;
        
        const thrustX = Math.cos(this.angle) * this.acceleration;
        const thrustY = Math.sin(this.angle) * this.acceleration;
        
        // Apply thrust (simplified, ideally use vectors)
        this.speed += this.acceleration; // Simple speed increase for now
        
        // Apply overburn if active
        const effectiveMaxSpeed = this.isOverburn ? this.maxSpeed * this.overburnSpeedMultiplier : this.maxSpeed;
        
        if (this.speed > effectiveMaxSpeed) {
            this.speed = effectiveMaxSpeed;
        }
        
        // Generate heat if overburning
        if (this.isOverburn) {
            this.addHeat(this.overburnHeatGeneration);
        }
    }

    // Toggle overburn mode
    setOverburn(enable) {
        // Can't enable overburn if shutdown
        if (enable && this.isShutdown) return;
        this.isOverburn = enable;
    }

    // Add heat to the ship
    addHeat(amount) {
        this.heat += amount;
        if (this.heat >= this.maxHeat) {
            this.heat = this.maxHeat;
            this.isShutdown = true;
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
        
        // Handle heat dissipation
        this.heat -= this.heatDissipationRate;
        if (this.heat < 0) this.heat = 0;
        
        // Check if we can recover from shutdown
        if (this.isShutdown && this.heat < this.maxHeat * 0.7) { // Recover when below 70% heat
            this.isShutdown = false;
        }
    }

    // Draw the ship (simple triangle for now)
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        // Draw ship body
        ctx.beginPath();
        ctx.moveTo(this.height / 2, 0); // Nose
        ctx.lineTo(-this.height / 2, this.width / 2); // Bottom left
        ctx.lineTo(-this.height / 2, -this.width / 2); // Top left
        ctx.closePath();
        
        // Show different appearance when shutdown
        if (this.isShutdown) {
            ctx.strokeStyle = 'gray';
            ctx.stroke();
        } else {
            ctx.strokeStyle = this.color;
            ctx.stroke();
            if (this.isOverburn) {
                // Draw thruster flame when overburning
                ctx.beginPath();
                ctx.moveTo(-this.height / 2, -this.width / 4);
                ctx.lineTo(-this.height * 0.8, 0);
                ctx.lineTo(-this.height / 2, this.width / 4);
                ctx.closePath();
                ctx.fillStyle = 'orange';
                ctx.fill();
            }
        }
        
        // Draw turret
        ctx.rotate(this.turret_angle - this.angle); // Rotate to turret angle
        ctx.beginPath();
        ctx.moveTo(this.height / 2, 0); // Front of turret
        ctx.lineTo(0, -3); // Left side
        ctx.lineTo(0, 3); // Right side
        ctx.closePath();
        ctx.fillStyle = this.isShutdown ? 'gray' : this.color;
        ctx.fill();
        
        ctx.restore();
        
        // Draw heat indicator above ship
        this.drawHeatIndicator();
    }
    
    // Draw heat indicator above the ship
    drawHeatIndicator() {
        const barWidth = 20;
        const barHeight = 4;
        const x = this.x - barWidth / 2;
        const y = this.y - this.height - 10;
        
        ctx.fillStyle = 'rgba(100, 100, 100, 0.5)';
        ctx.fillRect(x, y, barWidth, barHeight);
        
        // Heat color changes from green to yellow to red as heat increases
        let heatColor;
        const heatRatio = this.heat / this.maxHeat;
        if (heatRatio < 0.5) {
            heatColor = 'lime';
        } else if (heatRatio < 0.8) {
            heatColor = 'yellow';
        } else {
            heatColor = 'red';
        }
        
        ctx.fillStyle = heatColor;
        ctx.fillRect(x, y, barWidth * heatRatio, barHeight);
    }

    shoot() {
        // Cannot shoot when shutdown
        if (this.isShutdown) return;
        
        // Calculate bullet starting position at the turret muzzle
        const bulletX = this.x + Math.cos(this.turret_angle) * (this.height / 2);
        const bulletY = this.y + Math.sin(this.turret_angle) * (this.height / 2);

        // Calculate damage multiplier if overburn is active
        const damageMultiplier = this.isOverburn ? 1.5 : 1;
        
        // Add heat when shooting
        this.addHeat(this.heatGenerationFire);

        // Add a new bullet to the global bullets array
        bullets.push(new Bullet(bulletX, bulletY, this.turret_angle, this.color, damageMultiplier)); 
    }
}

class Explosion {
    constructor(x, y, maxRadius = 40, duration = 30, damageRadius = 60, maxDamage = 20) {
        this.x = x;
        this.y = y;
        this.time = 0;
        this.duration = duration;
        this.initialRadius = 5;
        this.maxRadius = maxRadius;
        this.damageRadius = damageRadius;
        this.maxDamage = maxDamage;
        this.damageDone = false;  // Track if explosion damage has been applied
    }
    
    update() {
        this.time++;
        return this.time < this.duration;
    }
    
    draw() {
        const progress = this.time / this.duration;
        const currentRadius = this.initialRadius + (this.maxRadius - this.initialRadius) * progress;
        const alpha = 1 - progress;
        
        // Draw outer glow
        ctx.beginPath();
        ctx.arc(this.x, this.y, currentRadius * 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 100, 0, ${alpha * 0.3})`;
        ctx.fill();
        
        // Draw main explosion
        ctx.beginPath();
        ctx.arc(this.x, this.y, currentRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 165, 0, ${alpha * 0.7})`;
        ctx.fill();
        
        // Draw core
        ctx.beginPath();
        ctx.arc(this.x, this.y, currentRadius * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 200, ${alpha * 0.9})`;
        ctx.fill();
    }
    
    applyDamage(ships) {
        if (this.damageDone) return;
        this.damageDone = true;
        
        ships.forEach(ship => {
            const dx = ship.x - this.x;
            const dy = ship.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < this.damageRadius) {
                // Calculate damage based on distance (closer = more damage)
                const damageRatio = 1 - (distance / this.damageRadius);
                const damage = Math.floor(this.maxDamage * damageRatio);
                
                ship.health -= damage;
                
                // Apply explosion force to push ship away
                const pushForce = damageRatio * 5;  // Adjust push force as needed
                ship.x += (dx / distance) * pushForce;
                ship.y += (dy / distance) * pushForce;
                
                // Generate small particle explosion on hit
                addShipHitEffect(ship.x, ship.y);
            }
        });
    }
}

// Small particle effect when ship is hit
function addShipHitEffect(x, y) {
    for (let i = 0; i < 8; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 2;
        const lifetime = 10 + Math.random() * 15;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: 1 + Math.random() * 2,
            color: `hsl(${30 + Math.random() * 30}, 100%, 70%)`,
            lifetime: lifetime,
            age: 0
        });
    }
}

// Update the collision detection between ships
function detectShipCollisions() {
    for (let i = 0; i < ships.length; i++) {
        const shipA = ships[i];
        
        // Check collisions with other ships
        for (let j = i + 1; j < ships.length; j++) {
            const shipB = ships[j];
            
            const dx = shipB.x - shipA.x;
            const dy = shipB.y - shipA.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < shipA.radius + shipB.radius) {
                // Ships are colliding - apply damage and bounce
                const damage = 5 + Math.floor(Math.max(shipA.speed, shipB.speed) * 2);
                
                shipA.health -= damage;
                shipB.health -= damage;
                
                // Create small collision effect
                addExplosion((shipA.x + shipB.x) / 2, (shipA.y + shipB.y) / 2, 20, 15);
                
                // Simple bounce physics
                const nx = dx / distance;  // normalized x component
                const ny = dy / distance;  // normalized y component
                
                // Calculate bounce force based on speed
                const bounceForce = 2.0;
                
                // Move ships apart (avoid sticking)
                const overlap = (shipA.radius + shipB.radius) - distance;
                shipA.x -= nx * overlap / 2;
                shipA.y -= ny * overlap / 2;
                shipB.x += nx * overlap / 2;
                shipB.y += ny * overlap / 2;
                
                // Apply velocity changes (simplified physics)
                const v1 = shipA.speed;
                const v2 = shipB.speed;
                
                shipA.speed = v2 * 0.5;
                shipB.speed = v1 * 0.5;
            }
        }
        
        // Check collision with arena boundaries
        if (shipA.x - shipA.radius < 0) {
            shipA.x = shipA.radius;
            shipA.speed *= 0.5;  // Reduce speed on wall impact
        } else if (shipA.x + shipA.radius > canvas.width) {
            shipA.x = canvas.width - shipA.radius;
            shipA.speed *= 0.5;
        }
        
        if (shipA.y - shipA.radius < 0) {
            shipA.y = shipA.radius;
            shipA.speed *= 0.5;
        } else if (shipA.y + shipA.radius > canvas.height) {
            shipA.y = canvas.height - shipA.radius;
            shipA.speed *= 0.5;
        }
    }
}

function addExplosion(x, y, maxRadius = 40, duration = 30) {
    explosions.push(new Explosion(x, y, maxRadius, duration));
}

function updateAndDrawExplosions() {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const exp = explosions[i];
        exp.draw();
        exp.applyDamage(ships);
        if (!exp.update()) {
            explosions.splice(i, 1);
        }
    }
}

function updateAndDrawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.age++;
        
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.fill();
        
        if (particle.age >= particle.lifetime) {
            particles.splice(i, 1);
        }
    }
}

// --- Game Loop ---
function gameLoop() {
    if (!gameRunning) return;

    // 1. Clear canvas
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw background grid (for visual reference)
    drawGrid();

    // 2. Update game objects
    ships.forEach(ship => ship.update());
    // Handle player input for the first ship
    const playerShip = ships[0];
    if (playerShip) {
        if (keysPressed.KeyA) {
            playerShip.rotate(-1);
        }
        if (keysPressed.KeyD) {
            playerShip.rotate(1);
        }
        if (keysPressed.KeyW) {
            playerShip.accelerate();
        }
        if (keysPressed.KeyS) {
            // Add backward/braking functionality
            if (playerShip.speed > 0) {
                playerShip.speed *= 0.9; // Brake when moving forward
            } else {
                playerShip.speed = -0.5; // Move backward slowly
            }
        }
        // Q/E to rotate turret
        if (keysPressed.KeyQ) {
            playerShip.rotateTurret(-1);
        }
        if (keysPressed.KeyE) {
            playerShip.rotateTurret(1);
        }
        if (keysPressed.KeyO) { // 'o' key for overburn
            playerShip.setOverburn(true);
        } else if (!keysPressed.KeyO && playerShip.isOverburn) {
            playerShip.setOverburn(false);
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
    detectShipCollisions();
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        for (let j = ships.length - 1; j >= 0; j--) {
            const ship = ships[j];

            // Simple distance check (circle collision)
            const dx = bullet.x - ship.x;
            const dy = bullet.y - ship.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < bullet.radius + ship.radius) {
                // Collision detected! Add explosion effect.
                addExplosion(bullet.x, bullet.y, 15, 20); // Small explosion at bullet impact point
                bullets.splice(i, 1); // Remove bullet
                ship.health -= 10 * bullet.damageMultiplier; // Decrease ship health
                
                // Add hit visual feedback
                addShipHitEffect(ship.x, ship.y);

                if (ship.health <= 0) {
                    // Ship destroyed - create large explosion
                    addExplosion(ship.x, ship.y, 60, 45);
                    ships.splice(j, 1); // Remove ship
                    
                    // Check win condition
                    checkWinCondition();
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
    updateAndDrawParticles();
    drawGameInfo();

    // Check if game is over
    if (gameRunning) {
        requestAnimationFrame(gameLoop);
    } else {
        drawGameOverMessage();
    }
}

// Draw background grid
function drawGrid() {
    const gridSize = 40;
    ctx.strokeStyle = 'rgba(50, 50, 50, 0.5)';
    ctx.lineWidth = 1;
    
    // Draw vertical lines
    for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    
    // Draw horizontal lines
    for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

// Draw game information
function drawGameInfo() {
    ctx.fillStyle = 'white';
    ctx.font = "14px Arial";
    ctx.fillText("Controls: W/A/S/D to move, Q/E to rotate turret, Space to shoot, O to activate overburn", 20, 20);
    
    // Show FPS (optional)
    const now = performance.now();
    if (!lastFrameTime) lastFrameTime = now;
    const deltaTime = now - lastFrameTime;
    lastFrameTime = now;
    const fps = Math.round(1000 / deltaTime);
    ctx.fillText(`FPS: ${fps}`, canvas.width - 100, 20);
}

// Game over screen
function drawGameOverMessage() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = 'white';
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    
    // Determine winner
    if (ships.length === 0) {
        ctx.fillText("Game Over - Draw!", canvas.width / 2, canvas.height / 2);
    } else if (ships[0] && ships[0].color === 'cyan') {
        ctx.fillText("You Win!", canvas.width / 2, canvas.height / 2);
    } else {
        ctx.fillText("AI Wins!", canvas.width / 2, canvas.height / 2);
    }
    
    ctx.font = '24px Arial';
    ctx.fillText("Reload the page to play again", canvas.width / 2, canvas.height / 2 + 50);
}

// Check for win condition
function checkWinCondition() {
    if (ships.length <= 1) {
        // Only one ship left or none - game is over
        setTimeout(() => {
            gameRunning = false;
        }, 1000); // Short delay to let last explosion play
    }
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

// --- Ship Initialization ---
function initGame() {
    // Reset game state
    ships = [];
    bullets = [];
    explosions = [];
    particles = [];
    gameRunning = true;
    
    // Create player ship (centered, cyan color)
    ships.push(new Ship(canvas.width / 4, canvas.height / 2, 'cyan'));
    
    // Create AI ship (opposite side, red color)
    ships.push(new Ship(canvas.width * 3/4, canvas.height / 2, 'red')); 
    
    // Random starting angles
    ships[0].angle = Math.random() * Math.PI * 2;
    ships[1].angle = Math.random() * Math.PI * 2;
    ships[0].turret_angle = ships[0].angle;
    ships[1].turret_angle = ships[1].angle;
    
    // Start the game loop
    gameLoop();
}

// --- Load AI Code function ---
function loadAICode() {
    const userCode = codeTextArea.value;
    
    // Make sure there's code to load
    if (!userCode.trim()) {
        outputArea.textContent = "Error: No code provided.";
        return;
    }
    
    try {
        // First look for a runAI function in the code
        const aiFunction = new Function(
            'ship', 
            'api',
            `
            // Wrap in try/catch for safer execution
            try {
                ${userCode}
                
                // Check if runAI function exists in the code
                if (typeof runAI === 'function') {
                    return runAI(ship, api);
                } else {
                    throw new Error("No 'runAI' function found in your code!");
                }
            } catch (err) {
                throw err; // Re-throw to outer catch
            }
            `
        );
        
        // Store the created function and update status
        ship2AI = function(ship, api) {
            try {
                return aiFunction(ship, api);
            } catch (error) {
                outputArea.textContent = `AI Error: ${error.message}`;
                console.error("AI Error:", error);
                return null;
            }
        };
        
        outputArea.textContent = "AI Code loaded successfully! Red ship is now controlled by your code.";
    } catch (error) {
        // Syntax error in the code
        outputArea.textContent = `Error compiling AI code: ${error.message}`;
        console.error("Error compiling AI code:", error);
        ship2AI = null;
    }
}

// --- Keyboard Input Handling ---
document.addEventListener('keydown', (event) => {
    // Handle both "Space" and " "
    const key = event.code === "Space" ? "Space" : event.code;
    if (key in keysPressed) {
        keysPressed[key] = true;
    }
});

document.addEventListener('keyup', (event) => {
    // Handle both "Space" and " "
    const key = event.code === "Space" ? "Space" : event.code;
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
