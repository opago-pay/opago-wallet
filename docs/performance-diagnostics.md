# Performance diagnostics

For a local Android diagnostic build, set `EXPO_PUBLIC_PERF_TRACE=true` when bundling the app. Leave it `false` in public builds. The flag is compiled into the JavaScript bundle; changing it on the device after installation has no effect.

Each `OPAGO_PERF` log batch contains fixed stage names, elapsed milliseconds, an outcome and a timestamp. `OPAGO_STARTUP` adds relative startup milestones. `OPAGO_SEND_TIMING` details the Spark send path for each attempt. The app never passes invoice text, amounts, addresses, keys or error messages into these trackers. The report keeps the latest 500 short entries in memory and disappears when the app process ends.

To collect a run without a computer, open **Security → Advanced options → Performance diagnostics → Copy timing report**. For USB debugging, capture `adb logcat` and filter for `OPAGO_PERF`, `OPAGO_STARTUP` and `OPAGO_SEND_TIMING`. Compare `ui.tap_to_handler` and `ui.event_loop_delay` to detect a blocked JavaScript thread; `nav.*` shows time until a destination screen is ready; `wallet.*`, `balance.*`, `history.*`, `scanner.*`, `receive.*` and `send.*` separate storage, network and SDK waits.

The report is diagnostic, not a benchmark: the first SDK connection, network conditions, device approval time and hardware load affect individual runs. Compare repeated runs on the same device and connection. Payment safety checks remain in place even if they take time.
