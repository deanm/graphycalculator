// (c) Dean McNamee <dean@gmail.com>.  All rights reserved.

// This library parses an input string, builds a parse tree, and allows you to
// evaluate the tree.  It is more or less some sort of calculator.
// Use it like:
//   var tree = GraphyCalculator.parse(input_string);  // throws on error.
//   var func = GraphyCalculator.create_evaluator(tree);
//   func(x, y);  // throws on error.

// Based on the principles of Top Down Operator Precedence:
//   http://javascript.crockford.com/tdop/tdop.html

var GraphyCalculator = (function() {

// Create an operator token class, with nud / led and binding power.
// |bp| is the binding power (precedence).
// |str| is the string of the operator.
// |right_assoc| is 0 if the operator is left associative, or 1 if it is right.
// |also_unary| is 1 if the operator can also be unary, otherwise 0.
function create_operator_token(str, bp, right_assoc, also_unary) {
  return {
    lbp: bp,
    led: function(left, s) {
      this.left = left;
      this.right = s.expression(bp - right_assoc, s);
      this.type = "op_b" + str;
      return this;
    },
    nud: function(s) {
      if (also_unary !== 1)
        throw "error in operator nud";
      this.left = s.expression(70, s);
      this.type = "op_u" + str;
      return this;
    }
  };
}

function create_value_token(val) {
  return {
    type: 'value',
    value: val,
    led: function(left, s) {
      throw "led called on a value token.";
    },
    nud: function(s) { return this; }
  };
}

function create_function_token(func) {
  return {
    type: 'function',
    value: func,
    led: function(left, s) {
      throw "Internal error: led called on a function.";
    },
    nud: function(s) {
      // Threat functions like an unary operator (-4), so sin 4+5 is sin(4)+5.
      this.left = s.expression(70, s);
      return this;
    }
  };
}

function create_variable_token(name) {
  return {
    type: 'variable',
    value: name,
    led: function(left, s) {
      throw "Internal error: led called on a variable.";
    },
    nud: function(s) { return this; }
  };
}

var function_table = {
  abs: Math.abs,
  acos: Math.acos,
  asin: Math.asin,
  atan: Math.atan,
  ceil: Math.ceil,
  cos: Math.cos,
  exp: Math.exp,
  floor: Math.floor,
  log: Math.log,
  // random: Math.random,  Could be interesting?
  round: Math.round,
  sin: Math.sin,
  sinc: function(x) { return x == 0 ? 1 : Math.sin(x) / x; },
  sqrt: Math.sqrt,
  tan: Math.tan
};

var constant_table = {
  E: Math.E,
  e: Math.E,
  pi: Math.PI,
  PI: Math.PI
};

// Take an expression string, tokenizes, and returns an Array of tokens.
// On an error, an exception is thrown.
function lex_scan(exp_str) {
  var tokens = [];
  var i = 0;
  var il = exp_str.length;
 
  // TODO(deanm): Don't support octal and hex right?  0099 == 99?
  // TODO(deanm): Scienitific notation?
  var reg_int = /^-?[0-9]+/;
  var reg_float = /^-?(([0-9]+\.[0-9]*)|(\.[0-9]+))/;  // TODO(deanm): clean up.
  var reg_sym = /^[a-zA-Z_][a-zA-Z0-9_]*/;

  while (i < il) {
    var str = exp_str.slice(i);  // TODO(deanm): Performance?
    var match;

    // Catch single terminal characters.  Ignore whitespace.
    switch (str[0]) {
      case "+": case "-":
        tokens.push(create_operator_token(str[0], 50, 0, 1));
        ++i;
        continue;
      case "*": case "/":
        tokens.push(create_operator_token(str[0], 60, 0, 0));
        ++i;
        continue;
      case "^":
        // Note, the precedence is higher than unary operators, this means
        // that -2**2 = -4, this matches Ruby and WorlframAlpha, for example.
        tokens.push(create_operator_token(str[0], 75, 1, 0));
        ++i;
        continue;
      case ")":
        // '(' will call expression(0), so create ) with a binding power of 0.
        tokens.push({
          type: ')',
          lbp: 0,
          led: function(left, s) { throw "Internal error: led called on ')'"; },
          nud: function(s) { throw "Internal error: nud called on ')'"; }
        });
        ++i;
        continue;
      case "(":
        tokens.push({
          type: '(',
          lbp: 80,
          led: function(left, s) { throw "Interal error, led called on '('"; },
          nud: function(s) {
            var e = s.expression(0, s);
            if (s.token().type != ')') {
              throw "Unmatched left parenthesis.";
            }
            s.advance();  // Advance over ')'.
            return e;  // Insert the expression not the paren into the tree.
          }
        });
        ++i;
        continue;
      case " ": case "\t":
      case "\r": case "\n":
        ++i;
        continue;
      default:
        // fall through and out.
    }

    // Process numbers.  Have to try floats first to catch '.'.
    if ((match = str.match(reg_float)) !== null) {
      tokens.push(create_value_token(parseFloat(match[0])));
      i += match[0].length;
      continue;
    }
    if ((match = str.match(reg_int)) !== null) {
      tokens.push(create_value_token(parseInt(match[0])));
      i += match[0].length;
      continue;
    }

    // Process symbol names.  We could either do validation here or in the
    // parser.  It is easier here, we can reject unknown symbols
    if ((match = str.match(reg_sym)) !== null) {
      if (match[0] == "x" || match[0] == "y") {
        tokens.push(create_variable_token(match[0]));
      } else {
        var func = function_table[match[0]];
        if (func !== undefined) {
          tokens.push(create_function_token(func));
        } else {
          var con = constant_table[match[0]];
          if (con !== undefined) {
            tokens.push(create_value_token(con));
          } else {
            throw "unknown symbol " + match[0];
          }
        }
      }
      i += match[0].length;
      continue;
    }

    throw "Failed in processing input: " + str;
  }

  return tokens;
}

function debug_dump_tokens(tokens) {
  for (var i = 0, il = tokens.length; i < il; ++i) {
    var t = tokens[i];
    window.console.log('token type: ' + t.type + ' value: ' + t.value);
  }
}

function debug_dump_parse_tree_node(node, prefix) {
  window.console.log(
      prefix + 'node type: ' + node.type + ' value: ' + node.value);
}

function debug_dump_parse_tree(tree, prefix) {
  if (tree !== undefined) {
    debug_dump_parse_tree_node(tree, prefix);
    debug_dump_parse_tree(tree.left, prefix + '  left -> ');
    debug_dump_parse_tree(tree.right, prefix + '  right -> '); 
  }
}

function create_parse_tree(tokens) {
  var state = {
    tokens: tokens,
    i: 0,
    at_end: function() { return this.i >= this.tokens.length; },
    token: function() {
      if (this.at_end()) {
        return {lbp: 0, type: 'end'};
      }
      return this.tokens[this.i];
    },
    advance: function() { ++this.i; },
    expression: function(rbp, s) {
      if (s.at_end())
        return undefined;
      var t = s.token();
      s.advance();
      var left = t.nud(s);
      while (rbp < s.token().lbp) {
        t = s.token();
        s.advance();
        left = t.led(left, s);
      }
      return left;
    }
  };

  return state.expression(0, state);
}

function evaluate_tree(tree, x, y) {
  if (tree === undefined)  // Bad input, missing a child on an operator, etc.
    throw "Error parsing input, probably invalid.";
  
  switch (tree.type) {
    case 'value':
      return tree.value;
    case 'variable':
      return tree.value === 'x' ? x : y;
    case 'function':
      return tree.value(evaluate_tree(tree.left, x, y));
    case 'op_u+':
      return evaluate_tree(tree.left, x, y);
    case 'op_b+':
      return evaluate_tree(tree.left, x, y) + evaluate_tree(tree.right, x, y);
    case 'op_u-':
      return -evaluate_tree(tree.left, x, y);
    case 'op_b-':
      return evaluate_tree(tree.left, x, y) - evaluate_tree(tree.right, x, y);
    case 'op_b*':
      return evaluate_tree(tree.left, x, y) * evaluate_tree(tree.right, x, y);
    case 'op_b/':
      return evaluate_tree(tree.left, x, y) / evaluate_tree(tree.right, x, y);
    case 'op_b^':
      return Math.pow(evaluate_tree(tree.left, x, y),
                      evaluate_tree(tree.right, x, y));
    default:
      throw "Internal error, unhandled node: " + tree.type + " " + tree.value;
  }
}

function create_evaluator(tree) {
  return function(x, y) {
    return evaluate_tree(tree, x, y);
  };
}

function parse(input) {
  return create_parse_tree(lex_scan(input));
}

return {
  parse: parse,
  create_evaluator: create_evaluator
};

})();  // End of GraphyCalculator namespace.
