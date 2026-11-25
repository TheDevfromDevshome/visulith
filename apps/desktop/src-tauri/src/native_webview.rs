use tauri::plugin::{Builder, TauriPlugin};
use tauri::Runtime;

/// Installs a no-op plugin on non-Windows targets.
#[cfg(not(windows))]
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("visulith-native-webview").build()
}

/// Disables WebView2 browser affordances that leak the web page into the app.
#[cfg(windows)]
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("visulith-native-webview")
    .on_webview_ready(|webview| {
      let _ = webview.with_webview(|platform| {
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
        use windows_core::Interface;

        let configure = || -> windows_core::Result<()> {
          unsafe {
            let controller = platform.controller();
            let webview = controller.CoreWebView2()?;
            let settings = webview.Settings()?;
            settings.SetAreDefaultContextMenusEnabled(false)?;
            settings
              .cast::<ICoreWebView2Settings3>()?
              .SetAreBrowserAcceleratorKeysEnabled(false)?;
          }
          Ok(())
        };
        let result = configure();

        if let Err(error) = result {
          eprintln!("Visulith konnte die WebView2-Browserfunktionen nicht deaktivieren: {error}");
        }
      });
    })
    .build()
}
