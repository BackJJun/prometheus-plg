package com.github.crux.prometheus.`continue`.process

import java.io.InputStream
import java.io.OutputStream

interface ContinueProcess {

    val input: InputStream
    val output: OutputStream

    fun close()

}
