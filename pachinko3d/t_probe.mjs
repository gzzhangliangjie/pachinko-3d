import { CFG, buildPhysicsWorld, createBall } from './src/layout.mjs';
const t0=Date.now();
const { world, matBall } = buildPhysicsWorld(CFG);
console.log('build world ms', Date.now()-t0, 'bodies', world.bodies.length);
const b = createBall(world, CFG, matBall, 0, 0);
const t1=Date.now();
for (let i=0;i<240;i++){ world.step(1/240); }
console.log('240 steps ms', Date.now()-t1, 'pos', b.position.toString());
