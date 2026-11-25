use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use tauri::Manager;

#[derive(Serialize)]
pub struct ProjectEntry {
    pub id: String,
    pub manifest: serde_json::Value,
}

#[derive(Serialize)]
pub struct ProcessOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// Resolve a project-relative path inside the app data directory.
/// Parent components are rejected so a plugin or UI script cannot escape the scope.
fn resolve_scoped(app: &tauri::AppHandle, relative: &str) -> Result<PathBuf, String> {
    let root = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let path = Path::new(relative);
    if path.components().any(|component| matches!(component, Component::ParentDir | Component::RootDir | Component::Prefix(_))) {
        return Err("path must stay inside the project scope".to_string());
    }
    Ok(root.join(path))
}

#[tauri::command]
pub fn list_projects(app: tauri::AppHandle) -> Result<Vec<ProjectEntry>, String> {
    let root = app.path().app_data_dir().map_err(|error| error.to_string())?.join("projects");
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let mut projects = Vec::new();
    for entry in fs::read_dir(root).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let manifest_path = entry.path().join("visulith.project.json");
        if !manifest_path.is_file() {
            continue;
        }
        let raw = fs::read_to_string(&manifest_path).map_err(|error| error.to_string())?;
        let manifest: serde_json::Value = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
        projects.push(ProjectEntry {
            id: entry.file_name().to_string_lossy().to_string(),
            manifest,
        });
    }
    Ok(projects)
}

#[tauri::command]
pub fn read_file(app: tauri::AppHandle, relative: String) -> Result<String, String> {
    let path = resolve_scoped(&app, &relative)?;
    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn write_file(app: tauri::AppHandle, relative: String, contents: String) -> Result<(), String> {
    let path = resolve_scoped(&app, &relative)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn run_program(app: tauri::AppHandle, relative: String, executable: Option<String>) -> Result<ProcessOutput, String> {
    let path = resolve_scoped(&app, &relative)?;
    let cwd = path.parent().ok_or_else(|| "missing working directory".to_string())?.to_path_buf();
    let output = Command::new(executable.unwrap_or_else(|| "node".to_string()))
        .arg(path)
        .current_dir(cwd)
        .output()
        .map_err(|error| error.to_string())?;
    Ok(ProcessOutput {
        exit_code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}
