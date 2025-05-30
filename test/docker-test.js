// test/docker-test.js
const WebSocket = require('ws');

/**
 * Simple Docker test to verify signaling server works
 */
async function testSignalingServer() {
  const serverUrl = process.env.SIGNALING_URL || 'ws://localhost:3001';
  console.log('🐳 Testing signaling server in Docker...');
  console.log(`📡 Connecting to: ${serverUrl}\n`);

  return new Promise((resolve, reject) => {
    const client = new WebSocket(serverUrl);
    let testsPassed = 0;
    const totalTests = 3;

    const timeout = setTimeout(() => {
      client.terminate();
      reject(new Error('Test timeout'));
    }, 10000);

    // Test 1: Connection
    client.on('open', () => {
      console.log('✅ Test 1/3: WebSocket connection established');
      testsPassed++;

      // Test 2: Send join message
      client.send(JSON.stringify({
        type: 'join',
        roomId: 'test-room',
        userId: 'test-user'
      }));
    });

    // Test 3: Receive messages
    client.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        
        if (message.type === 'joined') {
          console.log('✅ Test 2/3: Received join confirmation');
          testsPassed++;
        } else if (message.type === 'routerRtpCapabilities') {
          console.log('✅ Test 3/3: Received RTP capabilities');
          testsPassed++;
        }

        if (testsPassed >= totalTests) {
          clearTimeout(timeout);
          console.log('\n🎉 All tests passed! Docker container is working correctly.');
          client.close();
          resolve();
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(new Error(`Invalid message format: ${error.message}`));
      }
    });

    client.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Connection failed: ${error.message}`));
    });
  });
}

// Run test if executed directly
if (require.main === module) {
  testSignalingServer()
    .then(() => {
      console.log('✅ Docker test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Docker test failed:', error.message);
      process.exit(1);
    });
}

module.exports = testSignalingServer;