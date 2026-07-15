using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace OpenClawPetOverlay;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (!OverlayArguments.TryParse(args, out var options))
        {
            Console.Error.WriteLine("Usage: pet-overlay-win.exe <port> <size> <corner> [clickThrough] [sourceCount] [offsetX] [offsetY] [showStatus]");
            return 2;
        }

        // Prevent the WebView from flashing white before its controller is initialized.
        Environment.SetEnvironmentVariable("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "00000000");

        try
        {
            var app = new Application { ShutdownMode = ShutdownMode.OnMainWindowClose };
            app.DispatcherUnhandledException += (_, eventArgs) =>
            {
                Console.Error.WriteLine($"Unhandled Windows overlay error: {eventArgs.Exception.Message}");
                eventArgs.Handled = true;
                app.Shutdown(1);
            };
            return app.Run(new OverlayWindow(options));
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"Windows overlay failed: {error.Message}");
            return 1;
        }
    }
}

internal sealed record OverlayArguments(int Port, int Size, string Corner, bool ClickThrough, int SourceCount, int OffsetX, int OffsetY, bool ShowStatus)
{
    private static readonly HashSet<string> Corners =
    [
        "bottom-right",
        "bottom-left",
        "top-right",
        "top-left",
    ];

    internal static bool TryParse(string[] args, out OverlayArguments options)
    {
        options = null!;
        if (args.Length < 3 ||
            !int.TryParse(args[0], out var port) || port is < 1 or > 65535 ||
            !int.TryParse(args[1], out var size) || size is < 96 or > 768 ||
            !Corners.Contains(args[2]))
        {
            return false;
        }

        var clickThrough = args.Length >= 4 && bool.TryParse(args[3], out var parsed) && parsed;
        var sourceCount = args.Length >= 5 && int.TryParse(args[4], out var parsedCount) ? parsedCount : 1;
        if (sourceCount is < 1 or > 16) return false;
        var offsetX = args.Length >= 6 && int.TryParse(args[5], out var parsedOffsetX) ? parsedOffsetX : 0;
        var offsetY = args.Length >= 7 && int.TryParse(args[6], out var parsedOffsetY) ? parsedOffsetY : 0;
        var showStatus = true;
        if (args.Length >= 8 && !bool.TryParse(args[7], out showStatus)) return false;
        options = new OverlayArguments(port, size, args[2], clickThrough, sourceCount, offsetX, offsetY, showStatus);
        return true;
    }
}

internal sealed class OverlayWindow : Window
{
    private const int ExtendedStyleIndex = -20;
    private const long NoActivateStyle = 0x08000000L;
    private const long ToolWindowStyle = 0x00000080L;
    private const long TransparentStyle = 0x00000020L;
    private const long LayeredStyle = 0x00080000L;
    private const uint NonClientLeftButtonDown = 0x00A1;
    private const int CaptionHitTest = 2;
    private const uint NoSizePositionFlag = 0x0001;
    private const uint NoMovePositionFlag = 0x0002;
    private const uint NoZOrderPositionFlag = 0x0004;
    private const uint NoActivatePositionFlag = 0x0010;
    private const uint FrameChangedPositionFlag = 0x0020;
    private readonly OverlayArguments options;
    private readonly WebView2CompositionControl webView;
    private readonly Uri origin;
    private readonly Border? dragSurface;

    internal OverlayWindow(OverlayArguments options)
    {
        this.options = options;
        origin = new Uri($"http://127.0.0.1:{options.Port}/");

        Title = "OpenClaw Pet";
        Width = LayoutWidth(options.Size, options.SourceCount);
        Height = LayoutHeight(options.Size);
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        AllowsTransparency = true;
        Background = Brushes.Transparent;
        Topmost = true;
        ShowInTaskbar = false;
        ShowActivated = false;
        Focusable = false;

        webView = new WebView2CompositionControl
        {
            DefaultBackgroundColor = System.Drawing.Color.Transparent,
            Focusable = false,
            IsHitTestVisible = true,
            HorizontalAlignment = HorizontalAlignment.Stretch,
            VerticalAlignment = VerticalAlignment.Stretch,
        };

        var root = new Grid { Background = Brushes.Transparent };
        root.Children.Add(webView);
        if (!options.ClickThrough)
        {
            dragSurface = new Border
            {
                Background = Brushes.Transparent,
                Cursor = Cursors.SizeAll,
                Width = options.Size * options.SourceCount,
                Height = options.Size,
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Bottom,
            };
            dragSurface.MouseLeftButtonDown += BeginWindowDrag;
            root.Children.Add(dragSurface);
        }
        Content = root;

        SourceInitialized += ConfigureNativeWindow;
        Loaded += InitializeWebView;
        Closed += (_, _) => webView.Dispose();
        PositionInCorner();
    }

    private void PositionInCorner()
    {
        const double edge = 20;
        var workArea = SystemParameters.WorkArea;
        Left = (options.Corner.EndsWith("left", StringComparison.Ordinal)
            ? workArea.Left + edge
            : workArea.Right - Width - edge) + options.OffsetX;
        Top = (options.Corner.StartsWith("top", StringComparison.Ordinal)
            ? workArea.Top + edge
            : workArea.Bottom - Height - edge) + options.OffsetY;
    }

    private void ConfigureNativeWindow(object? sender, EventArgs eventArgs)
    {
        var handle = new WindowInteropHelper(this).Handle;
        var styles = ReadWindowLongPointer(handle, ExtendedStyleIndex).ToInt64() | NoActivateStyle | ToolWindowStyle;
        if (options.ClickThrough) styles |= TransparentStyle | LayeredStyle;
        WriteWindowLongPointer(handle, ExtendedStyleIndex, new IntPtr(styles));
        if (!SetWindowPos(
                handle,
                IntPtr.Zero,
                0,
                0,
                0,
                0,
                NoSizePositionFlag | NoMovePositionFlag | NoZOrderPositionFlag | NoActivatePositionFlag | FrameChangedPositionFlag))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not refresh OpenClaw Pet window styles.");
        }

        var source = HwndSource.FromHwnd(handle);
        source?.AddHook((IntPtr window, int message, IntPtr wParam, IntPtr lParam, ref bool handled) =>
        {
            const int mouseActivate = 0x0021;
            const int noActivate = 3;
            if (message != mouseActivate) return IntPtr.Zero;
            handled = true;
            return new IntPtr(noActivate);
        });
    }

    private void BeginWindowDrag(object sender, MouseButtonEventArgs eventArgs)
    {
        if (eventArgs.ChangedButton != MouseButton.Left) return;
        var handle = new WindowInteropHelper(this).Handle;
        ReleaseCapture();
        SendMessage(handle, NonClientLeftButtonDown, new IntPtr(CaptionHitTest), IntPtr.Zero);
        eventArgs.Handled = true;
    }

    private async void InitializeWebView(object sender, RoutedEventArgs eventArgs)
    {
        try
        {
            var userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "OpenClaw",
                "OpenClawPet",
                "WebView2");
            Directory.CreateDirectory(userDataFolder);
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: userDataFolder);
            await webView.EnsureCoreWebView2Async(environment);

            var core = webView.CoreWebView2;
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreHostObjectsAllowed = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsWebMessageEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.NavigationStarting += (_, navigation) =>
            {
                if (!Uri.TryCreate(navigation.Uri, UriKind.Absolute, out var target))
                {
                    navigation.Cancel = true;
                    return;
                }
                if (target.Scheme == "openclaw-pet" && target.Host == "watchdog-expired")
                {
                    navigation.Cancel = true;
                    Dispatcher.BeginInvoke(() => Application.Current.Shutdown(0));
                    return;
                }
                if (target.Scheme == "openclaw-pet" && target.Host == "resize")
                {
                    navigation.Cancel = true;
                    if (TryParseResize(target, out var size, out var sourceCount, out var offsetX, out var offsetY))
                    {
                        Dispatcher.BeginInvoke(() => ApplyRuntimeLayout(size, sourceCount, offsetX, offsetY));
                    }
                    return;
                }
                if (
                    target.Scheme != origin.Scheme ||
                    target.Host != origin.Host ||
                    target.Port != origin.Port)
                {
                    navigation.Cancel = true;
                }
            };
            core.NewWindowRequested += (_, newWindow) => newWindow.Handled = true;
            core.PermissionRequested += (_, permission) => permission.State = CoreWebView2PermissionState.Deny;
            core.DownloadStarting += (_, download) => download.Cancel = true;
            core.ProcessFailed += (_, failure) =>
            {
                Console.Error.WriteLine($"WebView2 process failed: {failure.ProcessFailedKind}");
                Dispatcher.BeginInvoke(() => Application.Current.Shutdown(1));
            };
            core.Navigate(origin.AbsoluteUri);
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"WebView2 initialization failed: {error.Message}");
            Application.Current.Shutdown(1);
        }
    }

    private void ApplyRuntimeLayout(int size, int sourceCount, int offsetX, int offsetY)
    {
        Width = LayoutWidth(size, sourceCount);
        Height = LayoutHeight(size);
        PositionInCorner(offsetX, offsetY);
        if (dragSurface is not null)
        {
            dragSurface.Width = size * sourceCount;
            dragSurface.Height = size;
        }
    }

    private double LayoutWidth(int size, int sourceCount)
    {
        var petWidth = size * sourceCount;
        return options.ShowStatus ? Math.Max(petWidth + 220, 320) : petWidth;
    }

    private double LayoutHeight(int size) => options.ShowStatus ? Math.Max(size, 160) : size;

    private void PositionInCorner(int offsetX, int offsetY)
    {
        const double edge = 20;
        var workArea = SystemParameters.WorkArea;
        Left = (options.Corner.EndsWith("left", StringComparison.Ordinal)
            ? workArea.Left + edge
            : workArea.Right - Width - edge) + offsetX;
        Top = (options.Corner.StartsWith("top", StringComparison.Ordinal)
            ? workArea.Top + edge
            : workArea.Bottom - Height - edge) + offsetY;
    }

    private static bool TryParseResize(Uri target, out int size, out int sourceCount, out int offsetX, out int offsetY)
    {
        size = 0;
        sourceCount = 0;
        offsetX = 0;
        offsetY = 0;
        foreach (var pair in target.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = pair.Split('=', 2);
            if (parts.Length != 2) continue;
            var name = Uri.UnescapeDataString(parts[0]);
            var value = Uri.UnescapeDataString(parts[1]);
            if (name == "size") int.TryParse(value, out size);
            if (name == "count") int.TryParse(value, out sourceCount);
            if (name == "offsetX") int.TryParse(value, out offsetX);
            if (name == "offsetY") int.TryParse(value, out offsetY);
        }
        return size is >= 96 and <= 768 && sourceCount is >= 1 and <= 16;
    }

    private static IntPtr ReadWindowLongPointer(IntPtr window, int index)
    {
        Marshal.SetLastPInvokeError(0);
        var result = IntPtr.Size == 8
            ? GetWindowLongPointer64(window, index)
            : new IntPtr(GetWindowLong32(window, index));
        var error = Marshal.GetLastPInvokeError();
        if (result == IntPtr.Zero && error != 0)
        {
            throw new Win32Exception(error, "Could not read OpenClaw Pet window styles.");
        }
        return result;
    }

    private static void WriteWindowLongPointer(IntPtr window, int index, IntPtr value)
    {
        Marshal.SetLastPInvokeError(0);
        var previous = IntPtr.Size == 8
            ? SetWindowLongPointer64(window, index, value)
            : new IntPtr(SetWindowLong32(window, index, value.ToInt32()));
        var error = Marshal.GetLastPInvokeError();
        if (previous == IntPtr.Zero && error != 0)
        {
            throw new Win32Exception(error, "Could not apply OpenClaw Pet window styles.");
        }
    }

    [DllImport("user32.dll", EntryPoint = "GetWindowLongW", SetLastError = true)]
    private static extern int GetWindowLong32(IntPtr window, int index);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr GetWindowLongPointer64(IntPtr window, int index);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongW", SetLastError = true)]
    private static extern int SetWindowLong32(IntPtr window, int index, int value);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr SetWindowLongPointer64(IntPtr window, int index, IntPtr value);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowPos(
        IntPtr window,
        IntPtr insertAfter,
        int x,
        int y,
        int width,
        int height,
        uint flags);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
}
