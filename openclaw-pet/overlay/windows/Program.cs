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
            Console.Error.WriteLine("Usage: pet-overlay-win.exe <port> <size> <corner> [clickThrough]");
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

internal sealed record OverlayArguments(int Port, int Size, string Corner, bool ClickThrough)
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
            !int.TryParse(args[1], out var size) || size < 1 ||
            !Corners.Contains(args[2]))
        {
            return false;
        }

        var clickThrough = args.Length >= 4 && bool.TryParse(args[3], out var parsed) && parsed;
        options = new OverlayArguments(port, size, args[2], clickThrough);
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
    private readonly OverlayArguments options;
    private readonly WebView2CompositionControl webView;
    private readonly Uri origin;

    internal OverlayWindow(OverlayArguments options)
    {
        this.options = options;
        origin = new Uri($"http://127.0.0.1:{options.Port}/");

        Title = "OpenClaw Pet";
        Width = options.Size;
        Height = options.Size;
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
            IsHitTestVisible = false,
            HorizontalAlignment = HorizontalAlignment.Stretch,
            VerticalAlignment = VerticalAlignment.Stretch,
        };

        var root = new Grid { Background = Brushes.Transparent };
        root.Children.Add(webView);
        if (!options.ClickThrough)
        {
            var dragSurface = new Border
            {
                Background = Brushes.Transparent,
                Cursor = Cursors.SizeAll,
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
        Left = options.Corner.EndsWith("left", StringComparison.Ordinal)
            ? workArea.Left + edge
            : workArea.Right - Width - edge;
        Top = options.Corner.StartsWith("top", StringComparison.Ordinal)
            ? workArea.Top + edge
            : workArea.Bottom - Height - edge;
    }

    private void ConfigureNativeWindow(object? sender, EventArgs eventArgs)
    {
        var handle = new WindowInteropHelper(this).Handle;
        var styles = GetWindowLongPointer(handle, ExtendedStyleIndex).ToInt64() | NoActivateStyle | ToolWindowStyle;
        if (options.ClickThrough) styles |= TransparentStyle | LayeredStyle;
        SetWindowLongPointer(handle, ExtendedStyleIndex, new IntPtr(styles));

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
                if (!Uri.TryCreate(navigation.Uri, UriKind.Absolute, out var target) ||
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

    private static IntPtr GetWindowLongPointer(IntPtr window, int index) =>
        IntPtr.Size == 8 ? GetWindowLongPointer64(window, index) : new IntPtr(GetWindowLong32(window, index));

    private static IntPtr SetWindowLongPointer(IntPtr window, int index, IntPtr value) =>
        IntPtr.Size == 8 ? SetWindowLongPointer64(window, index, value) : new IntPtr(SetWindowLong32(window, index, value.ToInt32()));

    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")]
    private static extern int GetWindowLong32(IntPtr window, int index);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
    private static extern IntPtr GetWindowLongPointer64(IntPtr window, int index);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongW")]
    private static extern int SetWindowLong32(IntPtr window, int index, int value);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")]
    private static extern IntPtr SetWindowLongPointer64(IntPtr window, int index, IntPtr value);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
}
