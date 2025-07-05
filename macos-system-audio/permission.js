const { promisify } = require("util");
const { exec } = require("child_process");
const path = require("path");
const execAsync = promisify(exec);

module.exports.checkPermissions = async () => {
  const recorderPath = path.join(__dirname, "Recorder");
  const { stdout: checkPermissionStdout } = await execAsync(`${recorderPath} --check-permissions`);
  const { code: checkPermissionCode } = JSON.parse(checkPermissionStdout);

  return checkPermissionCode === "PERMISSION_GRANTED";
};
