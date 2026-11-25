mod commands;
mod native_webview;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(native_webview::init())
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::read_file,
            commands::write_file,
            commands::run_program,
        ])
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            std::fs::create_dir_all(root.join("projects")).map_err(|error| error.to_string())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to start Visulith");
}
