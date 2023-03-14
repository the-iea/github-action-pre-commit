const child_process = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const core = require('@actions/core');
const exec = require('@actions/exec');
const github = require('@actions/github');
const tr = require('@actions/exec/lib/toolrunner');

function hashString(content) {
    const sha256 = crypto.createHash('sha256');
    return sha256.update(content).digest('hex');
}

function getPythonVersion() {
    const args = ['-c', 'import sys;print(sys.executable+"\\n"+sys.version)'];
    const res = child_process.spawnSync('python', args);
    if (res.status !== 0) {
        throw 'python version check failed';
    }
    return res.stdout.toString();
}

function hashFile(filePath) {
    return hashString(fs.readFileSync(filePath).toString());
}

function addToken(url, token) {
    return url.replace(/^https:\/\//, `https://x-access-token:${token}@`);
}

async function main() {
    await core.group('install pre-commit', async () => {
        await exec.exec('pip', ['install', 'pre-commit']);
        await exec.exec('pip', ['freeze', '--local']);
    });

    const args = [
        'run',
        '--show-diff-on-failure',
        '--color=always',
        ...tr.argStringToArray(core.getInput('extra_args')),
    ];
    // Ignore return code because it exits nonzero if it makes changes
    const ret = await exec.exec('pre-commit', args, {ignoreReturnCode: true});
    // If it exited nonzero, we want to run pre-commit again because it will now exit 0 if the only failures were
    //  things we could fix automatically. If it exits nonzero again, then we can't fix it automatically and we want
    //  to fail the action
    if (ret > 0) {
        await exec.exec('pre-commit', args);
        // If we get here, we know that pre-commit is happy, so we succeed
    }
}

main().catch((e) => core.setFailed(e.message));
