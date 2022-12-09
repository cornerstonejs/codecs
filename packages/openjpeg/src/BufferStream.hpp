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
    OPJ_BYTE* pbuf = p_source_buffer->buf;
    OPJ_BYTE* pcur = p_source_buffer->cur;

    OPJ_SIZE_T len = p_source_buffer->len;

    memcpy (p_source_buffer->cur, p_buffer, p_nb_bytes);
    p_source_buffer->cur += p_nb_bytes;

    return p_nb_bytes;
}

static OPJ_SIZE_T
opj_skip_from_buffer (OPJ_SIZE_T len, opj_buffer_info_t* psrc)
{
    OPJ_SIZE_T n = psrc->buf + psrc->len - psrc->cur;

    if (n) {
        if (n > len)
            n = len;

        psrc->cur += len;
    }
    else
        n = (OPJ_SIZE_T)-1;

    return n;
}

static OPJ_BOOL
opj_seek_from_buffer (OPJ_OFF_T len, opj_buffer_info_t* psrc)
{
    OPJ_SIZE_T n = psrc->len;

    if (n > len)
        n = len;

    psrc->cur = psrc->buf + n;

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