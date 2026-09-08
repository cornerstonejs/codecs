// Copyright (c) Chris Hafey.
// SPDX-License-Identifier: MIT

#pragma once

#include "openjpeg.h"

typedef struct opj_buffer_info {
    OPJ_BYTE* buf;
    OPJ_BYTE* cur;
    OPJ_SIZE_T len;
} opj_buffer_info_t;

static OPJ_SIZE_T
opj_read_from_buffer (void* pdst, OPJ_SIZE_T len, opj_buffer_info_t* psrc)
{
    OPJ_SIZE_T n = psrc->buf + psrc->len - psrc->cur;

    if (n) {
        if (n > len)
            n = len;

        memcpy (pdst, psrc->cur, n);
        psrc->cur += n;
    }
    else
        n = (OPJ_SIZE_T)-1;

    return n;
}

static OPJ_SIZE_T
opj_write_to_buffer (void* p_buffer, OPJ_SIZE_T p_nb_bytes,
                     opj_buffer_info_t* p_source_buffer)
{
    OPJ_SIZE_T remaining = p_source_buffer->buf + p_source_buffer->len - p_source_buffer->cur;

    if (remaining == 0)
        return (OPJ_SIZE_T)-1;

    OPJ_SIZE_T n = p_nb_bytes > remaining ? remaining : p_nb_bytes;

    memcpy (p_source_buffer->cur, p_buffer, n);
    p_source_buffer->cur += n;

    return n;
}

/*
 * Must match opj_stream_skip_fn exactly: OPJ_OFF_T (*)(OPJ_OFF_T, void*).
 * OPJ_OFF_T is int64_t, so declaring this with OPJ_SIZE_T -- 32-bit under
 * wasm32 -- made the cast below an (i64,i32)->i64 indirect call landing on an
 * (i32,i32)->i32 table entry, which traps as "function signature mismatch".
 *
 * It only fires when a skip is actually delegated to this callback:
 * opj_stream_read_skip serves anything within m_bytes_in_buffer straight from
 * the 1MB chunk it has already read, so small JP2 box skips are invisible and
 * only a skip past the buffered remainder -- a large tile-part, a large box --
 * reaches us. Hence a multi-tile image failing where the same image re-tiled
 * to a single tile decodes fine. Native builds tolerated the mismatched call,
 * so this only ever showed up in wasm.
 */
static OPJ_OFF_T
opj_skip_from_buffer (OPJ_OFF_T len, opj_buffer_info_t* psrc)
{
    OPJ_SIZE_T n = psrc->buf + psrc->len - psrc->cur;

    if (len < 0)
        return (OPJ_OFF_T)-1;

    if (n) {
        if (n > (OPJ_SIZE_T)len)
            n = (OPJ_SIZE_T)len;

        psrc->cur += n;

        return (OPJ_OFF_T)n;
    }

    /* buffer exhausted: cio.c compares the result against (OPJ_OFF_T)-1 */
    return (OPJ_OFF_T)-1;
}

static OPJ_BOOL
opj_seek_from_buffer (OPJ_OFF_T len, opj_buffer_info_t* psrc)
{
    if (len < 0)
        return OPJ_FALSE;

    OPJ_SIZE_T off = (OPJ_SIZE_T)len;

    if (off > psrc->len)
        off = psrc->len;

    psrc->cur = psrc->buf + off;

    return OPJ_TRUE;
}

opj_stream_t* OPJ_CALLCONV
opj_stream_create_buffer_stream (opj_buffer_info_t* psrc, OPJ_BOOL input)
{
    if (!psrc)
        return 0;

    opj_stream_t* ps = opj_stream_default_create (input);

    if (0 == ps)
        return 0;

    opj_stream_set_user_data        (ps, psrc, 0);
    opj_stream_set_user_data_length (ps, psrc->len);

    if (input)
        opj_stream_set_read_function (
            ps, (opj_stream_read_fn)opj_read_from_buffer);
    else
        opj_stream_set_write_function(
            ps,(opj_stream_write_fn) opj_write_to_buffer);

    opj_stream_set_skip_function (
        ps, (opj_stream_skip_fn)opj_skip_from_buffer);

    opj_stream_set_seek_function (
        ps, (opj_stream_seek_fn)opj_seek_from_buffer);

    return ps;
}