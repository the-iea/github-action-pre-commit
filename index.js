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
    const token = core.getInput('token');
    const git_user_name = core.getInput('git_user_name');
    const git_user_email = core.getInput('git_user_email');
    const git_commit_message = core.getInput('git_commit_message');

    const ret = await exec.exec('pre-commit', args, {ignoreReturnCode: true});

    if (ret > 0) {
        // If pre-commit exits nonzero, it means there are either changes to be made or we failed a test
        // So we want to run pre-commit again to make sure we're good
        // This time when we run pre-commit, if we get a nonzero exit code, we want to fail the action
        // because it means that more is failing than we can automatically fix
        await exec.exec('pre-commit', args);
        // If we get here, we know that pre-commit is happy, and we can push our changes

        const diff = await exec.exec(
            'git', ['diff', '--quiet'], {ignoreReturnCode: true}
        );
        if (diff > 0) {
            await core.group('push fixes', async () => {
                await exec.exec('git', ['config', 'user.name', git_user_name]);
                await exec.exec(
                    'git', ['config', 'user.email', git_user_email]
                );
                await exec.exec('git', ['commit', '-am', git_commit_message]);
                await exec.exec('git', ['push']);
            });
        }
    }
}

main().catch((e) => core.setFailed(e.message));
