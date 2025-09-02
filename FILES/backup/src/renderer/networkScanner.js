// src/renderer/networkScanner.js

/**
 * Simulates scanning the local network to find active Kiosk Apps.
 * In a real application, this would involve UDP broadcasts or mDNS.
 * @returns {Promise<Array<{id: string, name: string, ip: string}>>} A list of discovered kiosks.
 */
export function findKiosksOnNetwork() {
  console.log('Scanning local network for kiosks...');
  return new Promise((resolve) => {
    // Simulate a 2-second network scan
    setTimeout(() => {
      const mockKiosks = [
        { id: 'kiosk-1', name: 'Front Desk PC', ip: '192.168.1.101' },
        { id: 'kiosk-2', name: 'Check-in Station 2', ip: '192.168.1.102' },
      ];
      console.log('Found kiosks:', mockKiosks);
      resolve(mockKiosks);
    }, 2000);
  });
}

/**
 * Simulates pushing an event to a specific kiosk.
 * @param {string} kioskIp - The IP address of the target kiosk.
 * @param {object} eventData - The event data to push.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export function pushEventToKiosk(kioskIp, eventData) {
  console.log(`Pushing event "${eventData.name}" to kiosk at ${kioskIp}...`);
  return new Promise((resolve) => {
    // Simulate a 1.5-second API call
    setTimeout(() => {
      // In a real app, this would make a POST request to http://<kioskIp>:<port>/assign-event
      console.log('Push successful!');
      resolve({ success: true, message: `Successfully assigned event to ${kioskIp}` });
    }, 1500);
  });
}