const { Client } = require('ssh2');
const fs = require('fs');

const conn = new Client();

const filesToRead = [
    '/home/ubuntu/awsc-new/awesome/seo-processor-worker/CLAUDE.md',
    '/home/ubuntu/awsc-new/awesome/slack-app/index.js',
    '/home/ubuntu/awsc-new/awesome/slack-app/message-queue.json',
    '/home/ubuntu/awsc-new/awesome/slack-app/package.json'
];

async function readRemoteFiles() {
    return new Promise((resolve, reject) => {
        const results = {};
        let filesRead = 0;

        conn.on('ready', () => {
            console.log('Connected to remote server');

            filesToRead.forEach((filePath) => {
                conn.exec(`cat ${filePath}`, (err, stream) => {
                    if (err) {
                        console.error(`Error reading ${filePath}:`, err);
                        results[filePath] = { error: err.message };
                        filesRead++;
                        if (filesRead === filesToRead.length) {
                            conn.end();
                            resolve(results);
                        }
                        return;
                    }

                    let data = '';
                    stream.on('data', (chunk) => {
                        data += chunk.toString();
                    }).on('close', () => {
                        results[filePath] = data;
                        filesRead++;

                        // Save to local file
                        const localPath = './remote-' + filePath.split('/').pop();
                        fs.writeFileSync(localPath, data);
                        console.log(`Saved ${filePath} to ${localPath}`);

                        if (filesRead === filesToRead.length) {
                            conn.end();
                            resolve(results);
                        }
                    }).stderr.on('data', (data) => {
                        console.error(`Error output for ${filePath}:`, data.toString());
                    });
                });
            });
        }).connect({
            host: 'ssh.manuelporras.com',
            port: 2222,
            username: 'ubuntu',
            password: 'Texteandomelo890*'
        });

        conn.on('error', (err) => {
            reject(err);
        });
    });
}

readRemoteFiles()
    .then((results) => {
        console.log('\n=== Files read successfully ===');
        Object.keys(results).forEach(file => {
            if (results[file].error) {
                console.log(`${file}: ERROR - ${results[file].error}`);
            } else {
                console.log(`${file}: ${results[file].length} bytes`);
            }
        });
    })
    .catch((err) => {
        console.error('Connection error:', err);
        process.exit(1);
    });
