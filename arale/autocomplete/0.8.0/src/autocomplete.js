define(function(require, exports, module) {

    var $ = require('$');
    var Overlay = require('overlay');
    var Templatable = require('templatable');
    var Handlebars = require('handlebars');
    var DataSource = require('./data-source');
    var Filter = require('./filter');

    var template = require('./autocomplete.tpl');

    // keyCode
    var KEY = {
        UP: 38,
        DOWN: 40,
        LEFT: 37,
        RIGHT: 39,
        ENTER: 13,
        ESC: 27,
        BACKSPACE: 8
    };

    var AutoComplete = Overlay.extend({

        Implements: Templatable,

        attrs: {
            // 触发元素
            trigger: {
                value: null, // required
                getter: function(val) {
                    return $(val);
                }
            },
            classPrefix: 'ui-autocomplete',
            align: {
                baseXY: [0, '100%']
            },
            template: template,
            submitOnEnter: true, // 回车是否会提交表单
            dataSource: [], //数据源，支持 Array, URL, Object, Function
            locator: 'data',
            filter: 'startsWith', // 输出过滤
            inputFilter: defaultInputFilter, // 输入过滤
            // 以下仅为组件使用
            selectedIndex: undefined,
            inputValue: '', // 同步输入框的 value
            data: []
        },

        events: {
            // mousedown 先于 blur 触发，选中后再触发 blur 隐藏浮层
            'mousedown [data-role=item]': function(e) {
                this.selectItem();
            },
            'mouseenter [data-role=item]': function(e) {
                var i = this.items.index(e.currentTarget);
                this.set('selectedIndex', i);
            }
        },

        templateHelpers: {
            // 将匹配的高亮文字加上 hl 的样式
            highlightItem: function(classPrefix) {
                var index = this.highlightIndex,
                    cursor = 0, v = this.value, h = '';
                if ($.isArray(index)) {
                    for (var i = 0, l = index.length; i < l; i++) {
                        var j = index[i], start, length;
                        if ($.isArray(j)) {
                            start = j[0];
                            length = j[1] - j[0];
                        } else {
                            start = j;
                            length = 1;
                        }

                        if (start > cursor) {
                            h += v.substring(cursor, start);
                        }
                        if (start < v.length) {
                            h += '<span class="' + classPrefix + '-item-hl">' +
                                v.substr(start, length) +
                                '</span>';
                        }
                        cursor = start + length;
                        if (cursor >= v.length) {
                            break;
                        }
                    }
                    if (v.length > cursor) {
                        h += v.substring(cursor, v.length);
                    }
                    return new Handlebars.SafeString(h);
                }
                return this.value;
            }
        },

        parseElement: function() {
            this.model = {
                classPrefix: this.get('classPrefix'),
                items: []
            };

            AutoComplete.superclass.parseElement.call(this);
        },

        initProps: function(attribute) {
            this.dataSource = new DataSource({
                source: this.get('dataSource')
            }).on('data', this._filterData, this);
        },

        setup: function() {
            AutoComplete.superclass.setup.call(this);

            var trigger = this.get('trigger'), that = this;
            trigger.on('keyup.autocomplete', function(e) {
                // 获取输入的值
                var v = that.get('trigger').val(),
                    oldInput = that.get('inputValue');

                that.set('inputValue', v);

                // 如果输入为空，则清空并隐藏
                if (!v) {
                    that.hide();
                    that.set('data', []);
                    return;
                }

                // 模版为空，则隐藏
                if (!that.get('data').length) {
                    that.hide();
                    return;
                }

                // 如果输入变化才显示
                if (oldInput !== v) {
                    that.show();
                }
            }).on('keydown.autocomplete', function(e) {
                var currentIndex = that.get('selectedIndex');

                switch (e.which) {
                    // top arrow
                    case KEY.UP:
                        e.preventDefault();
                        if (!that.get('visible') && that.get('data').length) {
                            that.show();
                            return;
                        }
                        if (!that.items) {
                            return;
                        }
                        if (currentIndex > 0) {
                            that.set('selectedIndex', currentIndex - 1);
                        } else {
                            that.set('selectedIndex', that.items.length - 1);
                        }
                        break;

                    // bottom arrow
                    case KEY.DOWN:
                        e.preventDefault();
                        if (!that.get('visible') && that.get('data').length) {
                            that.show();
                            return;
                        }
                        if (!that.items) {
                            return;
                        }
                        if (currentIndex < that.items.length - 1) {
                            that.set('selectedIndex', currentIndex + 1);
                        } else {
                            that.set('selectedIndex', 0);
                        }
                        break;

                    // left arrow
                    case KEY.LEFT:
                        break;

                    // right arrow
                    case KEY.RIGHT:
                        if (!that.get('visible')) {
                            return;
                        }
                        that.selectItem();
                        break;

                    // enter
                    case KEY.ENTER:
                        // 是否阻止回车提交表单
                        if (!that.get('submitOnEnter')) {
                            e.preventDefault();
                        }
                        if (!that.get('visible')) {
                            return;
                        }
                        that.selectItem();
                        break;
                }
            }).on('blur.autocomplete', function(e) {
                that.hide();
            }).attr('autocomplete', 'off');

            this._tweakAlignDefaultValue();
        },

        show: function() {
            AutoComplete.superclass.show.call(this);
            this._setPosition();
        },

        destroy: function() {
            this.element.remove();
            AutoComplete.superclass.destroy.call(this);
        },

        selectItem: function() {
            this.get('trigger').focus();
            this.hide();

            var item = this.currentItem;
            if (item) {
                var value = item.attr('data-value');
                this.get('trigger').val(value);
                this.set('inputValue', value);
                this.trigger('itemSelect', value);
            }
        },

        // 调整 align 属性的默认值
        _tweakAlignDefaultValue: function() {
            var align = this.get('align');
            align.baseElement = this.get('trigger');
            this.set('align', align);
        },

        // 过滤数据
        _filterData: function(data) {
            var filter = this.get('filter'),
                locator = this.get('locator');

            // 获取目标数据
            data = locateResult(locator, data);

            // 如果 filter 不是 `function`，则从组件内置的 FILTER 获取
            if (!$.isFunction(filter)) {
                filter = Filter[filter];
            }
            if (filter && $.isFunction(filter)) {
                data = filter.call(this, data, this.realValue);
            } else {
                data = defaultOutputFilter.call(this, data);
            }
            this.set('data', data);
        },

        _clear: function(attribute) {
            this.$('[data-role=items]').empty();
            this.items = null;
            this.currentItem = null;
            this.set('selectedIndex', -1);
        },

        _onRenderInputValue: function(val) {
            if (val) {
                this.realValue = this.get('inputFilter').call(this, val);
                this.dataSource.getData(this.realValue);
            }
        },

        _onRenderData: function(val) {
            // 渲染无数据则隐藏
            if (!val.length) {
                this._clear();
                return;
            }
            // 清除下拉状态
            this.items = null;
            this.set('selectedIndex', -1);

            // 渲染下拉
            this.model.items = val;
            this.renderPartial('[data-role=items]');

            // 初始化下拉的状态
            this.items = this.$('[data-role=items]').children();
            this.currentItem = null;
        },

        _onRenderSelectedIndex: function(index) {
            if (index === -1) return;
            var className = this.get('classPrefix') + '-item-hover';
            if (this.currentItem) {
                this.currentItem.removeClass(className);
            }
            this.currentItem = this.items
                .eq(index)
                .addClass(className);

            this.trigger('indexChange', index);
        }
    });

    module.exports = AutoComplete;

    function isString(str) {
        return Object.prototype.toString.call(str) === '[object String]';
    }

    // 通过 locator 找到 data 中的某个属性的值
    // 1. locator 支持 function，函数返回值为结果
    // 2. locator 支持 string，而且支持点操作符寻址
    //     data {
    //       a: {
    //         b: 'c'
    //       }
    //     }
    //     locator 'a.b'
    // 最后的返回值为 c
    function locateResult(locator, data) {
        if (!locator) {
            return data;
        }
        if ($.isFunction(locator)) {
            return locator.call(this, data);
        } else if (isString(locator)) {
            var s = locator.split('.'), p = data, o;
            while (s.length) {
                var v = s.shift();
                if (!p[v]) {
                    break;
                }
                p = p[v];
            }
            return p;
        }
        return data;
    }

    function defaultInputFilter(v) {
        return v;
    }

    function defaultOutputFilter(data) {
        var result = [];
        $.each(data, function(index, value) {
            result.push({value: value});
        });
        return result;
    }
});
