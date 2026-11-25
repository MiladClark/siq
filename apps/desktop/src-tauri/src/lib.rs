use serde::Serialize;
use tauri::{
  menu::{Menu, MenuItem, PredefinedMenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  AppHandle, Emitter, Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
mod session;

const TRAY_ID: &str = "siq-tray";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopInfo {
  platform: &'static str,
  version: &'static str,
  mute_shortcut: &'static str,
  deafen_shortcut: &'static str,
}

fn reveal_main_window(app: &AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
  }
}

#[tauri::command]
fn desktop_get_info() -> DesktopInfo {
  DesktopInfo {
    platform: std::env::consts::OS,
    version: env!("CARGO_PKG_VERSION"),
    mute_shortcut: "Ctrl+Shift+M",
    deafen_shortcut: "Ctrl+Shift+D",
  }
}

#[tauri::command]
fn desktop_sync_voice_state(
  app: AppHandle,
  in_voice: bool,
  muted: bool,
  deafened: bool,
  channel_name: Option<String>,
) {
  let channel = channel_name
    .as_deref()
    .filter(|s| !s.trim().is_empty())
    .unwrap_or("Voice");

  let tooltip = if !in_voice {
    "siq — Private Voice & Chat".to_string()
  } else if deafened {
    format!("siq — {channel} (Deafened)")
  } else if muted {
    format!("siq — {channel} (Muted)")
  } else {
    format!("siq — {channel} (Voice Connected)")
  };

  if let Some(tray) = app.tray_by_id(TRAY_ID) {
    let _ = tray.set_tooltip(Some(&tooltip));
  }

  if let Some(window) = app.get_webview_window("main") {
    let win_title = if in_voice {
      format!("siq — {channel}")
    } else {
      "siq".to_string()
    };
    let _ = window.set_title(&win_title);
  }
}

#[tauri::command]
fn desktop_quit(app: AppHandle) {
  app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mute_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyM);
  let deafen_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyD);

  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      reveal_main_window(app);
    }))
    .plugin(tauri_plugin_opener::init())
    .plugin(
      tauri_plugin_global_shortcut::Builder::new()
        .with_handler(move |app, shortcut, event| {
          if event.state() != ShortcutState::Pressed {
            return;
          }
          if shortcut == &mute_shortcut {
            let _ = app.emit("siq://toggle-mute", ());
          } else if shortcut == &deafen_shortcut {
            let _ = app.emit("siq://toggle-deafen", ());
          }
        })
        .build(),
    )
    .setup(move |app| {
      // Register global gaming voice shortcuts safely (don't crash if another app holds them)
      let gs = app.global_shortcut();
      let _ = gs.register(mute_shortcut);
      let _ = gs.register(deafen_shortcut);

      // Build Windows System Tray menu
      let show_item = MenuItem::with_id(app, "show", "Open siq", true, None::<&str>)?;
      let mute_item = MenuItem::with_id(
        app,
        "mute",
        "Toggle Mic Mute (Ctrl+Shift+M)",
        true,
        None::<&str>,
      )?;
      let deafen_item = MenuItem::with_id(
        app,
        "deafen",
        "Toggle Deafen (Ctrl+Shift+D)",
        true,
        None::<&str>,
      )?;
      let sep = PredefinedMenuItem::separator(app)?;
      let quit_item = MenuItem::with_id(app, "quit", "Quit siq", true, None::<&str>)?;

      let tray_menu = Menu::with_items(app, &[&show_item, &mute_item, &deafen_item, &sep, &quit_item])?;

      let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .tooltip("siq — Private Voice & Chat")
        .on_menu_event(|app, event| match event.id.as_ref() {
          "show" => reveal_main_window(app),
          "mute" => {
            let _ = app.emit("siq://toggle-mute", ());
          }
          "deafen" => {
            let _ = app.emit("siq://toggle-deafen", ());
          }
          "quit" => {
            app.exit(0);
          }
          _ => {}
        })
        .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } = event
          {
            reveal_main_window(tray.app_handle());
          }
        });

      if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
      }

      let _ = tray_builder.build(app)?;
      Ok(())
    })
    .on_window_event(|window, event| {
      if window.label() == "main" {
        if let WindowEvent::CloseRequested { api, .. } = event {
          api.prevent_close();
          let _ = window.emit("siq://close-requested", ());
        }
      }
    })
    .invoke_handler(tauri::generate_handler![
      desktop_get_info,
      desktop_sync_voice_state,
      session::desktop_load_session,
      session::desktop_save_session,
      desktop_quit
    ])
    .run(tauri::generate_context!())
    .expect("error while running siq desktop application");
}
