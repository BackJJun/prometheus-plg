package com.github.crux.prometheus.browser

import com.github.crux.prometheus.constants.MessageTypes
import com.github.crux.prometheus.`continue`.GetTheme
import com.github.crux.prometheus.services.ContinuePluginService
import com.github.crux.prometheus.services.GsonService
import com.github.crux.prometheus.utils.uuid
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.ui.jcef.*
import org.cef.CefApp
import org.cef.browser.CefBrowser
import org.cef.handler.CefLoadHandlerAdapter
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import javax.swing.JComponent

class ContinueBrowser(
    private val project: Project,
    private val gsonService: GsonService = service<GsonService>(),
): Disposable {

    private val log = Logger.getInstance(ContinueBrowser::class.java.simpleName)
    private val browser: JBCefBrowser = JBCefBrowser.createBuilder().setOffScreenRendering(true).build()
    private val myJSQueryOpenInBrowser = JBCefJSQuery.create(browser as JBCefBrowserBase)
    private val pendingWebviewRequests = ConcurrentHashMap<String, CompletableFuture<Any?>>()
    private var pageLoaded = false

    init {
        CefApp.getInstance().registerSchemeHandlerFactory("http", "continue", CustomSchemeHandlerFactory())
        browser.jbCefClient.setProperty(JBCefClient.Properties.JS_QUERY_POOL_SIZE, 200)
        myJSQueryOpenInBrowser.addHandler { msg: String? ->
            val json = gsonService.gson.fromJson(msg, BrowserMessage::class.java)
            val messageType = json.messageType
            val data = json.data
            val messageId = json.messageId

            // Check if this is a response to a pending webview request
            if (messageId != null) {
                val pendingFuture = pendingWebviewRequests.remove(messageId)
                if (pendingFuture != null) {
                    // Extract the actual content from the response
                    val responseData = if (data is Map<*, *>) {
                        data["content"] ?: data
                    } else {
                        data
                    }
                    pendingFuture.complete(responseData)
                    return@addHandler null
                }
            }

            if (MessageTypes.PASS_THROUGH_TO_CORE.contains(messageType)) {
                project.service<ContinuePluginService>().coreMessenger?.request(messageType, data, messageId) { data ->
                    sendToWebview(messageType, data, messageId ?: uuid())
                }
                return@addHandler null
            }

            // If not pass through, then put it in the status/content/done format for webview
            // Core already sends this format
            if (msg != null) {
                project.service<ContinuePluginService>().ideProtocolClient?.handleMessage(msg) { data ->
                    sendToWebview(
                        messageType,
                        mapOf(
                            "status" to "success",
                            "content" to data,
                            "done" to true
                        ),
                        messageId ?: uuid()
                    )
                }
            }

            null
        }

        browser.jbCefClient.addLoadHandler(OnPageLoad {
            pageLoaded = true
            executeJavaScript(myJSQueryOpenInBrowser)
            val colors = GetTheme().getTheme()
            sendToWebview("jetbrains/setColors", colors)
        }, browser.cefBrowser)

        // Load the url only after the protocolClient is initialized,
        // otherwise some messages will be lost, which are some configurations when the page is loaded.
        // Moreover, we should add LoadHandler before loading the url.
        project.service<ContinuePluginService>().onProtocolClientInitialized {
            browser.loadURL(getGuiUrl())
        }

        browser.createImmediately()
    }

    fun isPageLoaded(): Boolean = pageLoaded

    fun getComponent(): JComponent =
        browser.component

    fun focusOnInput() {
        browser.component.components?.get(0)?.requestFocus()
    }

    fun openDevTools() {
        browser.openDevtools()
    }

    fun sendToWebview(messageType: String, data: Any? = null, messageId: String = uuid()) {
        val json = gsonService.gson.toJson(BrowserMessage(messageType, messageId, data))
        val jsCode = """window.postMessage($json, "*");"""
        try {
            browser.cefBrowser.executeJavaScript(jsCode, browser.cefBrowser.url, 0)
        } catch (error: IllegalStateException) {
            log.warn(error)
        }
    }

    /**
     * Send a request to the webview and return a CompletableFuture for the response.
     * This enables request-response communication with the webview (e.g., getting settings).
     */
    fun requestFromWebview(messageType: String, data: Any? = null): CompletableFuture<Any?> {
        val messageId = uuid()
        val future = CompletableFuture<Any?>()
        pendingWebviewRequests[messageId] = future
        sendToWebview(messageType, data, messageId)
        return future
    }

    private fun executeJavaScript(myJSQueryOpenInBrowser: JBCefJSQuery) {
        val script = """
            window.postIntellijMessage = function(messageType, data, messageId) {
                const msg = JSON.stringify({messageType, data, messageId});
                ${myJSQueryOpenInBrowser.inject("msg")}
            }
            """
        browser.cefBrowser.executeJavaScript(script, getGuiUrl(), 0)
    }

    override fun dispose() {
        Disposer.dispose(myJSQueryOpenInBrowser)
        Disposer.dispose(browser)
    }

    // todo: remove and use types.Message
    private data class BrowserMessage(
        val messageType: String,
        val messageId: String?,
        val data: Any?
    )

    private class OnPageLoad(
        private val onLoad: () -> Unit
    ) : CefLoadHandlerAdapter() {
        override fun onLoadingStateChange(
            browser: CefBrowser?,
            isLoading: Boolean,
            canGoBack: Boolean,
            canGoForward: Boolean
        ) {
            if (!isLoading)
                onLoad()
        }
    }

    private companion object {

        private fun getGuiUrl() =
            System.getenv("GUI_URL") ?: "http://continue/index.html"

    }

}