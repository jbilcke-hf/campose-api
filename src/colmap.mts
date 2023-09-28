import { exec } from "child_process"

/**
 * Interface for the options for the `runColmap` function.
 * See: https://colmap.github.io/cli.html
 */
export interface ColmapOptions {
  /**
   * The command to run (one of the available commands in COLMAP).
   */
  command: string;

  /**
   * The path to your project, which must contain a folder "images" with all the images.
   */
  projectPath?: string;

  /**
   * The workspace path for the project (used in some commands).
   */
  workspacePath?: string;

  /**
   * The image path for the project (used in some commands).
   */
  imagePath?: string;

  /**
   * The database path for the project (used in some commands).
   */
  databasePath?: string;

  /**
   * The output path for the project (used in some commands).
   */
  outputPath?: string;

  /**
   * Additional parameters that should be passed to the command.
   */
  parameters?: { [key: string]: any };

  /**
   * If set, forces the program to use CPU-based feature extraction and matching.
   */
  useCPU?: boolean;
}

/**
 * Run COLMAP commands from NodeJS programmatically.
 *
 * @param {ColmapOptions} options A set of configurations to be passed to the application.
 */
export const runColmap = (options: ColmapOptions): Promise<string> => {
  return new Promise((resolve, reject) => {
    let command = `colmap ${options.command}`;

    if (options.projectPath) command += ` --project_path ${options.projectPath}`;
    if (options.workspacePath) command += ` --workspace_path ${options.workspacePath}`;
    if (options.imagePath) command += ` --image_path ${options.imagePath}`;
    if (options.databasePath) command += ` --database_path ${options.databasePath}`;
    if (options.outputPath) command += ` --output_path ${options.outputPath}`;

    // Loop through additional parameters (if any) and add them to the command.
    if (options.parameters) {
      for (let key of Object.keys(options.parameters)) {
        command += ` --${key} ${options.parameters[key]}`;
      }
    }

    if (options.useCPU) command += ` --SiftExtraction.use_gpu 0 --SiftMatching.use_gpu 0`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('Error running colmap command:', command);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.log("stdout:", stdout);
        console.log("stderr:", stderr);
        reject(stderr);
      } else {
        resolve(stdout);
      }
    });
  });
};