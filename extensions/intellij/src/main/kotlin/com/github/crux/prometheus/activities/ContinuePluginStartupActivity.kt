package com.github.crux.prometheus.activities

import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.github.crux.prometheus.auth.AuthListener
import com.github.crux.prometheus.auth.ContinueAuthService
import com.github.crux.prometheus.auth.ControlPlaneSessionInfo
import com.github.crux.prometheus.browser.ContinueBrowserService.Companion.getBrowser
import com.github.crux.prometheus.constants.getContinueGlobalPath
import com.github.crux.prometheus.`continue`.*
import com.github.crux.prometheus.listeners.ContinuePluginSelectionListener
import com.github.crux.prometheus.services.ContinueExtensionSettings
import com.github.crux.prometheus.services.ContinuePluginService
import com.github.crux.prometheus.services.SettingsListener
import com.github.crux.prometheus.utils.toUriOrNull
import com.intellij.openapi.actionSystem.KeyboardShortcut
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ApplicationNamesInfo
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.keymap.KeymapManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import com.intellij.openapi.util.io.StreamUtil
import com.intellij.openapi.vfs.LocalFileSystem
import kotlinx.coroutines.*
import java.io.*
import java.nio.charset.StandardCharsets
import java.nio.file.Paths
import javax.swing.*
import com.intellij.openapi.components.service
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleManager
import com.intellij.openapi.project.ModuleListener
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.openapi.vfs.newvfs.BulkFileListener
import com.intellij.openapi.vfs.newvfs.events.VFileEvent
import com.intellij.openapi.vfs.newvfs.events.VFileDeleteEvent
import com.intellij.openapi.vfs.newvfs.events.VFileContentChangeEvent
import com.intellij.openapi.vfs.newvfs.events.VFileCreateEvent
import com.intellij.ide.ui.LafManagerListener
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.Function
import com.intellij.openapi.ui.Messages
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.notification.NotificationAction
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.CompletableFuture
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.intellij.testFramework.LightVirtualFile
import com.intellij.openapi.fileEditor.FileDocumentManagerListener
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.Document
import com.intellij.AppTopics


import com.intellij.openapi.util.Key

fun showTutorial(project: Project) {
    val tutorialFileName = getTutorialFileName()

    ContinuePluginStartupActivity::class.java.getClassLoader().getResourceAsStream(tutorialFileName)
        .use { `is` ->
            if (`is` == null) {
                throw IOException("Resource not found: $tutorialFileName")
            }
            var content = `is`.bufferedReader(StandardCharsets.UTF_8).readText()

            // All jetbrains will use J instead of L
            content = content.replace("[Cmd + L]", "[Cmd + J]")
            content = content.replace("[Cmd + Shift + L]", "[Cmd + Shift + J]")

            if (!System.getProperty("os.name").lowercase().contains("mac")) {
                content = content.replace("[Cmd + J]", "[Ctrl + J]")
                content = content.replace("[Cmd + Shift + J]", "[Ctrl + Shift + J]")
                content = content.replace("[Cmd + I]", "[Ctrl + I]")
                content = content.replace("⌘", "⌃")
            }
            val filepath = Paths.get(getContinueGlobalPath(), tutorialFileName).toString()
            File(filepath).writeText(content)
            val virtualFile = LocalFileSystem.getInstance().findFileByPath(filepath)

            ApplicationManager.getApplication().invokeLater {
                if (virtualFile != null) {
                    FileEditorManager.getInstance(project).openFile(virtualFile, true)
                }
            }
        }
}

private fun getTutorialFileName(): String {
    val appName = ApplicationNamesInfo.getInstance().fullProductName.lowercase()
    return when {
        appName.contains("intellij") -> "continue_tutorial.java"
        appName.contains("pycharm") -> "continue_tutorial.py"
        appName.contains("webstorm") -> "continue_tutorial.ts"
        else -> "continue_tutorial.py" // Default to Python tutorial
    }
}



private val SECURITY_FIX_IN_PROGRESS_KEY = Key.create<Boolean>("SecurityFixInProgress")

class ContinuePluginStartupActivity : StartupActivity, DumbAware {

    override fun runActivity(project: Project) {
        removeShortcutFromAction(getPlatformSpecificKeyStroke("J"))
        removeShortcutFromAction(getPlatformSpecificKeyStroke("shift J"))
        removeShortcutFromAction(getPlatformSpecificKeyStroke("I"))
        initializePlugin(project)
    }

    private fun getPlatformSpecificKeyStroke(key: String): String {
        val osName = System.getProperty("os.name").lowercase()
        val modifier = if (osName.contains("mac")) "meta" else "control"
        return "$modifier $key"
    }

    private fun removeShortcutFromAction(shortcut: String) {
        val keymap = KeymapManager.getInstance().activeKeymap
        val keyStroke = KeyStroke.getKeyStroke(shortcut)
        val actionIds = keymap.getActionIds(keyStroke)

        // If Continue has been re-assigned to another key, don't remove the shortcut
        if (!actionIds.any { it.startsWith("continue") }) {
            return
        }

        for (actionId in actionIds) {
            if (actionId.startsWith("continue")) {
                continue
            }
            val shortcuts = keymap.getShortcuts(actionId)
            for (shortcut in shortcuts) {
                if (shortcut is KeyboardShortcut && shortcut.firstKeyStroke == keyStroke) {
                    keymap.removeShortcut(actionId, shortcut)
                }
            }
        }
    }

    private fun initializePlugin(project: Project) {
        val coroutineScope = CoroutineScope(Dispatchers.IO)
        val continuePluginService = project.service<ContinuePluginService>()

        coroutineScope.launch {
            val settings = service<ContinueExtensionSettings>()
            // Tutorial disabled - logo window will not appear
            // if (!settings.continueState.shownWelcomeDialog) {
            //     settings.continueState.shownWelcomeDialog = true
            //     showTutorial(project)
            // }

            settings.addRemoteSyncJob()

            val ideProtocolClient = IdeProtocolClient(
                continuePluginService,
                coroutineScope,
                project
            )

            val diffManager = DiffManager(project)

            continuePluginService.diffManager = diffManager
            continuePluginService.ideProtocolClient = ideProtocolClient

            // Listen to changes to settings so the core can reload remote configuration
            val connection = ApplicationManager.getApplication().messageBus.connect()
            connection.subscribe(SettingsListener.TOPIC, object : SettingsListener {
                override fun settingsUpdated(settings: ContinueExtensionSettings.ContinueState) {
                    continuePluginService.coreMessenger?.request(
                        "config/ideSettingsUpdate", mapOf(
                            "remoteConfigServerUrl" to settings.remoteConfigServerUrl,
                            "remoteConfigSyncPeriod" to settings.remoteConfigSyncPeriod,
                            "userToken" to settings.userToken,
                        ), null
                    ) { _ -> }
                }
            })

            // Handle file changes and deletions - reindex
            connection.subscribe(VirtualFileManager.VFS_CHANGES, object : BulkFileListener {
                override fun after(events: List<VFileEvent>) {
                    // Collect all relevant URIs for deletions
                    val deletedURIs = events.filterIsInstance<VFileDeleteEvent>()
                        .mapNotNull { event -> event.file.toUriOrNull() }

                    // Send "files/deleted" message if there are any deletions
                    if (deletedURIs.isNotEmpty()) {
                        val data = mapOf("uris" to deletedURIs)
                        continuePluginService.coreMessenger?.request("files/deleted", data, null) { _ -> }
                    }

                    // Collect all relevant URIs for content changes
                    val changedFiles = events.filterIsInstance<VFileContentChangeEvent>()
                        .map { event -> event.file }
                    
                    val changedURIs = changedFiles.mapNotNull { it.toUriOrNull() }

                    // Notify core of content changes
                    if (changedURIs.isNotEmpty()) {
                        val data = mapOf("uris" to changedURIs)
                        continuePluginService.coreMessenger?.request("files/changed", data, null) { _ -> }
                    }
                    
                    // Security check on file save
                    // Note: Security check is now handled by FileDocumentManagerListener below

                    events.filterIsInstance<VFileCreateEvent>()
                        .mapNotNull { event -> event.file?.toUriOrNull() }
                        .takeIf { it.isNotEmpty() }?.let {
                            val data = mapOf("uris" to it)
                            continuePluginService.coreMessenger?.request("files/created", data, null) { _ -> }
                        }

                    // TODO: Missing handling of copying files, renaming files, etc.
                }
            })

            // Handle workspace directories changes
            connection.subscribe(
                ModuleListener.TOPIC,
                object : ModuleListener {
                    override fun modulesAdded(project: Project, modules: MutableList<out Module>) {

                        val allModulePaths = ModuleManager.getInstance(project).modules
                            .flatMap { module -> ModuleRootManager.getInstance(module).contentRoots.mapNotNull { it.toUriOrNull() } }

                        val topLevelModulePaths = allModulePaths
                            .filter { modulePath -> allModulePaths.none { it != modulePath && modulePath.startsWith(it) } }

                        continuePluginService.workspacePaths = topLevelModulePaths.toTypedArray();
                    }

                    override fun moduleRemoved(project: Project, module: Module) {
                        val removedPaths = ModuleRootManager.getInstance(module).contentRoots.mapNotNull { it.toUriOrNull() } ;
                        continuePluginService.workspacePaths = continuePluginService.workspacePaths?.toList()?.filter { path -> removedPaths.none {removedPath -> path == removedPath }}?.toTypedArray();
                    }

                    override fun modulesRenamed(
                        project: Project,
                        modules: MutableList<out Module>,
                        oldNameProvider: Function<in Module, String>
                    ) {
                        val allModulePaths = ModuleManager.getInstance(project).modules
                            .flatMap { module -> ModuleRootManager.getInstance(module).contentRoots.mapNotNull { it.toUriOrNull() } }

                        val topLevelModulePaths = allModulePaths
                            .filter { modulePath -> allModulePaths.none { it != modulePath && modulePath.startsWith(it) } }

                        continuePluginService.workspacePaths = topLevelModulePaths.toTypedArray()
                    }
                }
            )

            connection.subscribe(FileEditorManagerListener.FILE_EDITOR_MANAGER, object : FileEditorManagerListener {
                override fun fileClosed(source: FileEditorManager, file: VirtualFile) {
                    file.toUriOrNull()?.let { uri ->
                        val data = mapOf("uris" to listOf(uri))
                        continuePluginService.coreMessenger?.request("files/closed", data, null) { _ -> }
                    }
                }

                override fun fileOpened(source: FileEditorManager, file: VirtualFile) {
                    file.toUriOrNull()?.let { uri ->
                        val data = mapOf("uris" to listOf(uri))
                        continuePluginService.coreMessenger?.request("files/opened", data, null) { _ -> }
                    }
                }
            })

            // Handle file save for security check
            connection.subscribe(AppTopics.FILE_DOCUMENT_SYNC, object : FileDocumentManagerListener {
                override fun beforeDocumentSaving(document: Document) {
                    println("[Security Check DEBUG] beforeDocumentSaving triggered!")
                    val file = com.intellij.openapi.fileEditor.FileDocumentManager.getInstance().getFile(document)
                    println("[Security Check DEBUG] File: ${file?.path}, Extension: ${file?.extension}")
                    
                    if (file != null) {
                        // DEBUG: Show immediate notification to confirm listener is working
                        // ApplicationManager.getApplication().invokeLater {
                        //     NotificationGroupManager.getInstance()
                        //         .getNotificationGroup("Prometheus Security")
                        //         .createNotification(
                        //             "[DEBUG] File Save Detected",
                        //             "File: ${file.name}",
                        //             NotificationType.INFORMATION
                        //         )
                        //         .notify(project)
                        // }
                        
                        performSecurityCheck(project, file, continuePluginService, coroutineScope)
                    } else {
                        println("[Security Check DEBUG] File is null!")
                    }
                }
            })

            // Listen for theme changes
            connection.subscribe(LafManagerListener.TOPIC, LafManagerListener {
                val colors = GetTheme().getTheme()
                project.getBrowser()?.sendToWebview("jetbrains/setColors", colors)
            })

            // Listen for clicking settings button to start the auth flow
            val authService = service<ContinueAuthService>()
            val initialSessionInfo = authService.loadControlPlaneSessionInfo()

            if (initialSessionInfo != null) {
                val data = mapOf(
                    "sessionInfo" to initialSessionInfo
                )
                continuePluginService.coreMessenger?.request("didChangeControlPlaneSessionInfo", data, null) { _ -> }
            }

            connection.subscribe(AuthListener.TOPIC, object : AuthListener {
                override fun startAuthFlow() {
                    authService.startAuthFlow(project, false)
                }

                override fun handleUpdatedSessionInfo(sessionInfo: ControlPlaneSessionInfo?) {
                    val data = mapOf(
                        "sessionInfo" to sessionInfo
                    )
                    continuePluginService.coreMessenger?.request(
                        "didChangeControlPlaneSessionInfo",
                        data,
                        null
                    ) { _ -> }
                }
            })

            val listener =
                ContinuePluginSelectionListener(
                    coroutineScope,
                )

            // Reload the WebView
            continuePluginService?.let { pluginService ->
                val allModulePaths = ModuleManager.getInstance(project).modules
                    .flatMap { module -> ModuleRootManager.getInstance(module).contentRoots.mapNotNull { it.toUriOrNull() } }

                val topLevelModulePaths = allModulePaths
                    .filter { modulePath -> allModulePaths.none { it != modulePath && modulePath.startsWith(it) } }

                pluginService.workspacePaths = topLevelModulePaths.toTypedArray()
            }

            EditorFactory.getInstance().eventMulticaster.addSelectionListener(
                listener,
                project.service<ContinuePluginDisposable>()
            )

            val coreMessengerManager = CoreMessengerManager(project, ideProtocolClient, coroutineScope)
            continuePluginService.coreMessengerManager = coreMessengerManager
        }
    }
}

// Security scan result types
data class SecurityIssue(
    val cwe_ids: List<String>,
    val id: String,
    val title: String,
    val description: String,
    val documentation_url: String,
    val line_number: Int,
    val full_filename: String,
    val filename: String,
    val source: SecuritySource?,
    val code_extract: String
)

data class SecuritySource(
    val start: Int,
    val end: Int,
    val column: SecurityColumn?
)

data class SecurityColumn(
    val start: Int,
    val end: Int
)

data class SecurityScanOutput(
    val critical: List<SecurityIssue>?,
    val high: List<SecurityIssue>?,
    val medium: List<SecurityIssue>?,
    val low: List<SecurityIssue>?,
    val warning: List<SecurityIssue>?
)

data class SecurityScanResponse(
    val filename: String,
    val output: Any?, // Can be string or SecurityScanOutput
    val error: String?,
    val exit_code: Int,
    val success: Boolean
)

// Helper function to format security scan results as Markdown
private fun formatSecurityReportMarkdown(fileName: String, output: Map<String, Any?>): String {
    val severityEmoji = mapOf(
        "critical" to "🔴",
        "high" to "🟠",
        "medium" to "🟡",
        "low" to "🟢",
        "warning" to "⚪"
    )

    val severityLabels = mapOf(
        "critical" to "Critical",
        "high" to "High",
        "medium" to "Medium",
        "low" to "Low",
        "warning" to "Warning"
    )

    val sb = StringBuilder()
    sb.append("# 🛡️ Security Scan Report\n\n")
    sb.append("**File:** `$fileName`\n\n")
    sb.append("---\n\n")

    // Count issues
    val counts = mutableMapOf<String, Int>()
    var totalIssues = 0
    severityLabels.keys.forEach { severity ->
        val issues = output[severity] as? List<*> ?: emptyList<Any>()
        counts[severity] = issues.size
        totalIssues += issues.size
    }

    // Summary
    sb.append("## 📊 Summary\n\n")
    sb.append("| Severity | Count |\n")
    sb.append("|----------|-------|\n")
    severityLabels.keys.forEach { severity ->
        if ((counts[severity] ?: 0) > 0) {
            sb.append("| ${severityEmoji[severity]} ${severityLabels[severity]} | ${counts[severity]} |\n")
        }
    }
    sb.append("| **Total** | **$totalIssues** |\n\n")

    // Details by severity
    severityLabels.keys.forEach { severity ->
        val issues = output[severity] as? List<*> ?: emptyList<Any>()
        if (issues.isEmpty()) return@forEach

        sb.append("---\n\n")
        sb.append("## ${severityEmoji[severity]} ${severityLabels[severity]} Issues (${issues.size})\n\n")

        issues.forEachIndexed { i, issueAny ->
            val issue = issueAny as? Map<*, *> ?: return@forEachIndexed
            val title = issue["title"] as? String ?: ""
            val id = issue["id"] as? String ?: ""
            val cweIds = issue["cwe_ids"] as? List<*> ?: emptyList<Any>()
            val lineNumber = (issue["line_number"] as? Number)?.toInt() ?: 0
            val documentationUrl = issue["documentation_url"] as? String ?: ""
            val codeExtract = issue["code_extract"] as? String ?: ""
            val description = issue["description"] as? String ?: ""

            sb.append("### ${i + 1}. $title\n\n")
            sb.append("- **Rule ID:** `$id`\n")
            sb.append("- **CWE:** ${cweIds.joinToString(", ") { "[CWE-$it](https://cwe.mitre.org/data/definitions/$it.html)" }}\n")
            sb.append("- **Line:** $lineNumber\n")
            sb.append("- **Documentation:** [View Details]($documentationUrl)\n\n")

            if (codeExtract.isNotEmpty()) {
                sb.append("**Vulnerable Code:**\n```\n$codeExtract\n```\n\n")
            }

            sb.append("$description\n\n")
        }
    }

    return sb.toString()
}

private fun performSecurityCheck(
    project: Project,
    file: VirtualFile,
    continuePluginService: ContinuePluginService,
    coroutineScope: CoroutineScope
) {

    // Check if security fix is in progress for this document
    val document = FileDocumentManager.getInstance().getDocument(file)
    if (document != null && document.getUserData(SECURITY_FIX_IN_PROGRESS_KEY) == true) {
        println("[Security Check] Skipped: Security fix in progress")
        return
    }

    coroutineScope.launch(Dispatchers.IO) {
        try {
            // Skip if plugin panel not loaded yet
            val browser = project.getBrowser()
            if (browser == null || !browser.isPageLoaded()) {
                println("[Security Check] Skipped: Plugin panel not loaded yet")
                return@launch
            }

            val filePath = file.path
            val fileName = file.name
            val fileExtension = file.extension?.lowercase() ?: ""

            println("[Security Check] File saved: $filePath")

            // Get config from core
            val configFuture = CompletableFuture<Map<*, *>?>()
            continuePluginService.coreMessenger?.request("config/getSerializedProfileInfo", null, null) { response ->
                try {
                    println("[Security Check DEBUG] Raw response type: ${response?.javaClass?.name}")
                    println("[Security Check DEBUG] Raw response: $response")
                    
                    val responseMap = response as? Map<*, *>
                    // Config is nested: content -> result -> config
                    val content = responseMap?.get("content") as? Map<*, *>
                    val result = content?.get("result") as? Map<*, *>
                    val profileConfig = result?.get("config") as? Map<*, *>
                    
                    println("[Security Check DEBUG] content: ${content?.keys}")
                    println("[Security Check DEBUG] result: ${result?.keys}")
                    println("[Security Check DEBUG] profileConfig keys: ${profileConfig?.keys}")
                    
                    configFuture.complete(profileConfig)
                } catch (e: Exception) {
                    println("[Security Check] Error parsing config: ${e.message}")
                    e.printStackTrace()
                    configFuture.complete(null)
                }
            }

            val config = try {
                configFuture.get(1, java.util.concurrent.TimeUnit.SECONDS)
            } catch (e: Exception) {
                println("[Security Check] Timeout getting config: ${e.message}")
                null
            }

            val serverApiUrl = config?.get("serverApiUrl") as? String
            println("[Security Check] Config loaded - serverApiUrl: $serverApiUrl")

            if (serverApiUrl.isNullOrEmpty()) {
                println("[Security Check] Skipped: No serverApiUrl configured")
                return@launch
            }

            // Default security targets if not configured
            @Suppress("UNCHECKED_CAST")
            val securityTargets = (config["securityTarget"] as? List<String>) ?: listOf("java", "py", "kt", "ts", "js")
            println("[Security Check] File extension: $fileExtension, Targets: $securityTargets")

            // Check if file extension is in security_target
            if (!securityTargets.contains(fileExtension)) {
                println("[Security Check] Skipped: File extension not in target list")
                return@launch
            }

            // Get security check mode from webview (same as VSCode)
            val securityCheckMode = try {
                val mode = project.getBrowser()?.requestFromWebview("getSecurityCheckMode")
                    ?.get(2, java.util.concurrent.TimeUnit.SECONDS) as? String
                println("[Security Check] Mode from webview: $mode")
                mode ?: "askFirst"
            } catch (e: Exception) {
                println("[Security Check] Failed to get mode from webview, using default: ${e.message}")
                "askFirst"
            }

            if (securityCheckMode == "off") {
                println("[Security Check] Skipped: Mode is off")
                return@launch
            }

            val runSecurityCheck: suspend () -> Unit = runSecurityCheck@{
                // Show loading notification
                var loadingNotification: com.intellij.notification.Notification? = null
                ApplicationManager.getApplication().invokeLater {
                    loadingNotification = NotificationGroupManager.getInstance()
                        .getNotificationGroup("Prometheus Security")
                        .createNotification(
                            "🛡️ Security Check",
                            "$fileName 검사 중...",
                            NotificationType.INFORMATION
                        )
                    loadingNotification?.notify(project)
                }
                
                try {
                    println("[Security Check] Running security check...")
                    val fileContent = file.contentsToByteArray()

                    // Create multipart form-data
                    val boundary = "----FormBoundary${System.currentTimeMillis()}"
                    val crlf = "\r\n"

                    val preFileData = "--$boundary$crlf" +
                            "Content-Disposition: form-data; name=\"file\"; filename=\"$fileName\"$crlf" +
                            "Content-Type: application/octet-stream$crlf$crlf"

                    val postFileData = "$crlf--$boundary--$crlf"

                    val preBuffer = preFileData.toByteArray(Charsets.UTF_8)
                    val postBuffer = postFileData.toByteArray(Charsets.UTF_8)

                    val body = ByteArray(preBuffer.size + fileContent.size + postBuffer.size)
                    System.arraycopy(preBuffer, 0, body, 0, preBuffer.size)
                    System.arraycopy(fileContent, 0, body, preBuffer.size, fileContent.size)
                    System.arraycopy(postBuffer, 0, body, preBuffer.size + fileContent.size, postBuffer.size)

                    println("[Security Check] Calling API: $serverApiUrl/scan")

                    val url = URL("$serverApiUrl/scan")
                    val connection = url.openConnection() as HttpURLConnection
                    connection.requestMethod = "POST"
                    connection.doOutput = true
                    connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")

                    connection.outputStream.use { it.write(body) }

                    val responseCode = connection.responseCode
                    if (responseCode != HttpURLConnection.HTTP_OK) {
                        val errorBody = connection.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                        val errorMessage = "API returned $responseCode: $errorBody"
                        println("[Security Check] $errorMessage")

                        ApplicationManager.getApplication().invokeLater {
                            loadingNotification?.expire()
                            NotificationGroupManager.getInstance()
                                .getNotificationGroup("Prometheus Security")
                                .createNotification(
                                    "🛡️ Security Check Failed",
                                    "서버 오류 ($responseCode): $errorBody",
                                    NotificationType.ERROR
                                )
                                .notify(project)
                        }
                        return@runSecurityCheck
                    }

                    val responseBody = connection.inputStream.bufferedReader().use { it.readText() }

                    println("[Security Check] API Response: $responseBody")

                    val gson = Gson()
                    val resultType = object : TypeToken<Map<String, Any?>>() {}.type
                    val result: Map<String, Any?> = gson.fromJson(responseBody, resultType)

                    val success = result["success"] as? Boolean ?: false
                    val output = result["output"]

                    // Format output as Markdown if it's a Map (JSON object)
                    val formattedOutput = if (output is Map<*, *>) {
                        @Suppress("UNCHECKED_CAST")
                        formatSecurityReportMarkdown(fileName, output as Map<String, Any?>)
                    } else {
                        output?.toString() ?: ""
                    }

                    // Store scan result data for fix API
                    val scanSuccess = success
                    val scanFormattedOutput = formattedOutput

                    ApplicationManager.getApplication().invokeLater {
                        // Hide loading notification
                        loadingNotification?.expire()
                        
                        if (scanSuccess) {
                            // Show success notification
                            NotificationGroupManager.getInstance()
                                .getNotificationGroup("Prometheus Security")
                                .createNotification(
                                    "🛡️ Security Check",
                                    "$fileName - 문제가 발견되지 않았습니다.",
                                    NotificationType.INFORMATION
                                )
                                .notify(project)
                        } else {
                            // Show security report immediately in virtual file
                            val virtualFile = LightVirtualFile("Security Report - $fileName.md", scanFormattedOutput)
                            FileEditorManager.getInstance(project).openFile(virtualFile, true)

                            // Security Fix: Call /scan/fix based on mode
                            coroutineScope.launch(Dispatchers.IO) {
                                // Get security fix mode - default to manual
                                // Get security fix mode from webview (same as VSCode)
                                val securityFixMode = try {
                                    val mode = project.getBrowser()?.requestFromWebview("getSecurityFixMode")
                                        ?.get(2, java.util.concurrent.TimeUnit.SECONDS) as? String
                                    println("[Security Fix] Fix mode from webview: $mode")
                                    mode ?: "manual"
                                } catch (e: Exception) {
                                    println("[Security Fix] Failed to get fix mode from webview, using default: ${e.message}")
                                    "manual"
                                }

                                // Determine whether to call fix API based on mode
                                var shouldCallFixApi = false
                                if (securityFixMode == "automatic") {
                                    shouldCallFixApi = true
                                } else if (securityFixMode == "manual") {
                                    // Manual: Show notification with actions
                                    val userChoice = CompletableFuture<Boolean>()
                                    
                                    ApplicationManager.getApplication().invokeLater {
                                        val notification = NotificationGroupManager.getInstance()
                                            .getNotificationGroup("Prometheus Security")
                                            .createNotification(
                                                "🔧 Security Fix",
                                                "$fileName - 보안 수정을 진행하시겠습니까?",
                                                NotificationType.INFORMATION
                                            )
                                        
                                        notification.addAction(NotificationAction.create("수정 진행") { _, _ ->
                                            userChoice.complete(true)
                                            notification.expire()
                                        })
                                        
                                        notification.addAction(NotificationAction.create("건너뛰기") { _, _ ->
                                            userChoice.complete(false)
                                            notification.expire()
                                        })
                                        
                                        notification.notify(project)
                                        
                                        // Auto-expire after 5 minutes if no action taken
                                        coroutineScope.launch {
                                            delay(300000) // 5 minutes
                                            if (!userChoice.isDone) {
                                                userChoice.complete(false)
                                                notification.expire()
                                            }
                                        }
                                    }
                                    
                                    try {
                                        shouldCallFixApi = userChoice.get()
                                    } catch (e: Exception) {
                                        println("[Security Fix] User choice error: ${e.message}")
                                        shouldCallFixApi = false
                                    }
                                }
                                // securityFixMode == "off" → shouldCallFixApi remains false

                                if (!shouldCallFixApi) {
                                    return@launch
                                }

                                // Show fix loading notification
                                var fixLoadingNotification: com.intellij.notification.Notification? = null
                                ApplicationManager.getApplication().invokeLater {
                                    fixLoadingNotification = NotificationGroupManager.getInstance()
                                        .getNotificationGroup("Prometheus Security")
                                        .createNotification(
                                            "🔧 Security Fix",
                                            "$fileName 보안 문제 수정 중...",
                                            NotificationType.INFORMATION
                                        )
                                    fixLoadingNotification?.notify(project)
                                }

                                try {
                                    println("[Security Fix] Calling /scan/fix API...")
                                    val fileContentStr = String(file.contentsToByteArray(), Charsets.UTF_8)

                                    val fixRequestBody = gson.toJson(mapOf(
                                        "messages" to listOf(mapOf(
                                            "role" to "user",
                                            "content" to "다음은 보안 검사 결과입니다. 발견된 보안 문제를 수정해주세요.\n\n## 보안 검사 결과\n$scanFormattedOutput\n\n## 원본 소스코드 ($fileName)\n```\n$fileContentStr\n```\n\nedit_existing_file 도구를 사용하여 보안 문제가 수정된 전체 파일 내용을 제공해주세요."
                                        ))
                                    ))

                                    val fixUrl = URL("$serverApiUrl/scan/fix")
                                    val fixConnection = fixUrl.openConnection() as HttpURLConnection
                                    fixConnection.requestMethod = "POST"
                                    fixConnection.doOutput = true
                                    fixConnection.setRequestProperty("Content-Type", "application/json")
                                    fixConnection.connectTimeout = 120000
                                    fixConnection.readTimeout = 120000

                                    fixConnection.outputStream.use { it.write(fixRequestBody.toByteArray(Charsets.UTF_8)) }

                                    val fixResponseCode = fixConnection.responseCode
                                    val fixResponseBody = if (fixResponseCode == HttpURLConnection.HTTP_OK) {
                                        fixConnection.inputStream.bufferedReader().use { it.readText() }
                                    } else {
                                        val errorBody = fixConnection.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                                        throw Exception("API returned $fixResponseCode: $errorBody")
                                    }

                                    println("[Security Fix] API Response: $fixResponseBody")

                                    // Parse response — extract edit_existing_file tool call
                                    val fixResult: Map<String, Any?> = gson.fromJson(fixResponseBody, resultType)
                                    @Suppress("UNCHECKED_CAST")
                                    val choices = fixResult["choices"] as? List<Map<String, Any?>>
                                    @Suppress("UNCHECKED_CAST")
                                    val message = choices?.firstOrNull()?.get("message") as? Map<String, Any?>

                                    var fixContent: String? = null

                                    // Check for tool_calls (edit_existing_file)
                                    @Suppress("UNCHECKED_CAST")
                                    val toolCalls = message?.get("tool_calls") as? List<Map<String, Any?>>
                                    if (!toolCalls.isNullOrEmpty()) {
                                        for (toolCall in toolCalls) {
                                            @Suppress("UNCHECKED_CAST")
                                            val function = toolCall["function"] as? Map<String, Any?>
                                            if (function?.get("name") == "edit_existing_file") {
                                                val argumentsStr = function["arguments"] as? String ?: ""
                                                try {
                                                    val args: Map<String, Any?> = gson.fromJson(argumentsStr, resultType)
                                                    fixContent = args["changes"] as? String ?: ""
                                                    println("[Security Fix] edit_existing_file filepath: ${args["filepath"]}")
                                                } catch (e: Exception) {
                                                    println("[Security Fix] Failed to parse tool call args: ${e.message}")
                                                }
                                                break
                                            }
                                        }
                                    } else {
                                        // Fallback: plain content
                                        fixContent = message?.get("content") as? String
                                    }

                                    ApplicationManager.getApplication().invokeLater {
                                        fixLoadingNotification?.expire()

                                        if (fixContent.isNullOrEmpty()) {
                                            NotificationGroupManager.getInstance()
                                                .getNotificationGroup("Prometheus Security")
                                                .createNotification(
                                                    "🔧 Security Fix",
                                                    "$fileName - 수정 내용을 받지 못했습니다.",
                                                    NotificationType.WARNING
                                                )
                                                .notify(project)
                                            return@invokeLater
                                        }

                                        if (securityFixMode == "automatic") {
                                            // Auto-apply: Write fixed content to file
                                            WriteCommandAction.runWriteCommandAction(project) {
                                                try {
                                                    val document = FileDocumentManager.getInstance().getDocument(file)
                                                    if (document != null) {
                                                        // Mark document as being fixed to avoid triggering security check loop
                                                        document.putUserData(SECURITY_FIX_IN_PROGRESS_KEY, true)
                                                        try {
                                                            document.setText(fixContent)
                                                            FileDocumentManager.getInstance().saveDocument(document)
                                                            NotificationGroupManager.getInstance()
                                                                .getNotificationGroup("Prometheus Security")
                                                                .createNotification(
                                                                    "🔧 Security Fix",
                                                                    "$fileName - 보안 문제가 자동으로 수정되었습니다.",
                                                                    NotificationType.INFORMATION
                                                                )
                                                                .notify(project)
                                                        } finally {
                                                            document.putUserData(SECURITY_FIX_IN_PROGRESS_KEY, null)
                                                        }
                                                    }
                                                } catch (e: Exception) {
                                                    println("[Security Fix] Auto-apply failed: ${e.message}")
                                                    NotificationGroupManager.getInstance()
                                                        .getNotificationGroup("Prometheus Security")
                                                        .createNotification(
                                                            "🔧 Security Fix 실패",
                                                            "$fileName - 자동 적용에 실패했습니다: ${e.message}",
                                                            NotificationType.ERROR
                                                        )
                                                        .notify(project)
                                                }
                                            }
                                        } else if (securityFixMode == "manual") {
                                            // Manual: Show diff (original vs modified) with Apply action
                                            val originalContent = String(file.contentsToByteArray(), Charsets.UTF_8)
                                            val diffContentFactory = com.intellij.diff.DiffContentFactory.getInstance()
                                            val originalDiffContent = diffContentFactory.create(project, originalContent)
                                            val modifiedDiffContent = diffContentFactory.create(project, fixContent)
                                            val diffRequest = com.intellij.diff.requests.SimpleDiffRequest(
                                                "🔧 Security Fix: $fileName (원본 ↔ 수정)",
                                                originalDiffContent,
                                                modifiedDiffContent,
                                                "원본",
                                                "수정된 코드"
                                            )
                                            com.intellij.diff.DiffManager.getInstance().showDiff(project, diffRequest)

                                            // Show notification with Apply action
                                            val applyNotification = NotificationGroupManager.getInstance()
                                                .getNotificationGroup("Prometheus Security")
                                                .createNotification(
                                                    "🔧 Security Fix",
                                                    "$fileName - 수정 제안을 확인하세요. '적용' 버튼을 누르면 적용됩니다.",
                                                    NotificationType.INFORMATION
                                                )
                                            applyNotification.addAction(object : com.intellij.notification.NotificationAction("적용") {
                                                override fun actionPerformed(e: com.intellij.openapi.actionSystem.AnActionEvent, notification: com.intellij.notification.Notification) {
                                                    WriteCommandAction.runWriteCommandAction(project) {
                                                        try {
                                                            val document = FileDocumentManager.getInstance().getDocument(file)
                                                            if (document != null) {
                                                                // Mark document as being fixed to avoid triggering security check loop
                                                                document.putUserData(SECURITY_FIX_IN_PROGRESS_KEY, true)
                                                                try {
                                                                    document.setText(fixContent)
                                                                    FileDocumentManager.getInstance().saveDocument(document)
                                                                } finally {
                                                                    document.putUserData(SECURITY_FIX_IN_PROGRESS_KEY, null)
                                                                }
                                                            }
                                                        } catch (ex: Exception) {
                                                            println("[Security Fix] Apply failed: ${ex.message}")
                                                        }
                                                    }
                                                    notification.expire()
                                                    NotificationGroupManager.getInstance()
                                                        .getNotificationGroup("Prometheus Security")
                                                        .createNotification(
                                                            "🔧 Security Fix",
                                                            "$fileName - 보안 수정이 적용되었습니다.",
                                                            NotificationType.INFORMATION
                                                        )
                                                        .notify(project)
                                                }
                                            })
                                            applyNotification.notify(project)
                                        }
                                    }
                                } catch (fixError: Exception) {
                                    println("[Security Fix] API call failed: ${fixError.message}")
                                    fixError.printStackTrace()
                                    ApplicationManager.getApplication().invokeLater {
                                        fixLoadingNotification?.expire()
                                        NotificationGroupManager.getInstance()
                                            .getNotificationGroup("Prometheus Security")
                                            .createNotification(
                                                "🔧 Security Fix 실패",
                                                "$fileName - ${fixError.message ?: "Unknown error"}",
                                                NotificationType.ERROR
                                            )
                                            .notify(project)
                                    }
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    println("[Security Check] API call failed: ${e.message}")
                    e.printStackTrace()
                    ApplicationManager.getApplication().invokeLater {
                        // Hide loading notification
                        loadingNotification?.expire()
                        
                        NotificationGroupManager.getInstance()
                            .getNotificationGroup("Prometheus Security")
                            .createNotification(
                                "🛡️ Security Check 실패",
                                e.message ?: "Unknown error",
                                NotificationType.ERROR
                            )
                            .notify(project)
                    }
                }
            }

            if (securityCheckMode == "automatic") {
                runSecurityCheck()
            } else if (securityCheckMode == "askFirst") {
                ApplicationManager.getApplication().invokeLater {
                    val selection = Messages.showYesNoDialog(
                        project,
                        "시큐리티 검사를 하시겠습니까? ($fileName)",
                        "Prometheus",
                        "Yes",
                        "No",
                        Messages.getQuestionIcon()
                    )
                    if (selection == Messages.YES) {
                        coroutineScope.launch(Dispatchers.IO) {
                            runSecurityCheck()
                        }
                    }
                }
            }
        } catch (e: Exception) {
            println("[Security Check] Setup failed: ${e.message}")
            e.printStackTrace()
        }
    }
}